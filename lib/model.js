/**
 * RedisModel
 * ----------
 *
 * Work with data in redis, using the familiar model pattern.
 *
 * @module cantina
 * @submodule redis
 * @exports {Function} RedisModel constructor
 * @requires cantina, EventEmitter, model, prefixId, hydration, inherits
 */
var utils = require('cantina-utils')
  , EventEmitter = require('events').EventEmitter
  , Model = require('cantina-model').Model
  , prefixId = require('./prefix-id')
  , hydration = require('hydration')
  ;

/**
 * A model class with persistence provided by redis. Allows javascript type
 * primatives to be stored accurately in redis (a string-only store), and
 * automatically maintains index sets for querying by a collection.
 *
 * Example
 * =======
 *
 *     var model = new RedisModel(
 *       {
 *         color: 'red',
 *         owner: 'jim'
 *       },
 *       {
 *         namespace: 'guns',
 *         client: redis.createClient()
 *       }
 *     );
 *
 * @class RedisModel
 * @constructor
 * @extends Model
 * @param attrs {Object} Properties to instantiate the model with.
 * @param options {Object|RedisCollection} Options to apply to the model.
 *   **Note:** If you are using a `RedisCollection`, you should pass the
 *   collection in place of options, and the model will inherit the collection's
 *   namespace, client, schema, indexes, etc.
 *
 *   Supported options:
 *
 *   - **namespace** {String} Prefix to separate the storage of models in this
 *     collection. Default: `generic`
 *   - **client** {Object} _(required)_ Redis client object. You may pass
 *     `app.client` or create a new client with `redis.createClient()`
 *   - **indexes** {Array} List of properties to make findable. May also be passed
 *     through `schema` by setting `index: true` on a property. Do not use both!
 *   - **key** {String} Internal name of the ID property. Default: `_id`
 *   - **key_length** {Number} String length for auto-generated key. Default: `8`
 *   - **schema** {Object} [JSON schema](http://json-schema.org/) to validate against.
 *   - **onInit** {Function} Callback to run in the model's scope when
 *     it initializes. Useful for attaching event listeners.
 */
function RedisModel(attrs, options) {
  if (!options.client) {
    throw new Error('Must call RedisModel#init() with a redis client in options.client');
  }

  utils.defaults(options, {
    namespace: 'generic',
    indexes: []
  });

  RedisModel.super.call(this, attrs, options);

  var self = this;

  this._hydrate();

  if (this.onInit) {
    this.on('init', this.onInit.bind(this));
  }
  this.on('init', function() {
    this.on('save:before', function() {
      this._dehydrate();
    });
    this.on('save:after', function() {
      this._hydrate();
      this.client.SADD(prefixId(null, this.namespace), this.id);
      this.indexes.forEach(function(index) {
        if (typeof self.properties[index] != 'undefined') {
          self.client.SADD(prefixId(index + ':' + self.properties[index], self.namespace), self.id);
        }
      });
    });
    this.on('destroy:after', function() {
      this.client.SREM(prefixId(null, this.namespace), this.id);
      this.indexes.forEach(function(index) {
        if (typeof self.properties[index] != 'undefined') {
          self.client.SREM(prefixId(index + ':' + self.properties[index], self.namespace), self.id);
        }
      });
    });
  });

  this.emit('init');

  return this;
}
utils.inherits(RedisModel, Model);

/**
 * Save the model's properties to redis.
 *
 * Example
 * =======
 *
 *     model.save(function(err, model) {
 *       if (err) {
 *         // err can be a validation object or redis exception!
 *       }
 *       // work with model
 *     });
 *
 * @method save
 * @param cb {Function} Callback to handle error and receive updated model.
 * @chainable
 */
RedisModel.prototype.save = function(cb) {
  var self = this, cb_ran = false;
  var validation = this.validate();
  if (!validation.valid) {
    cb && cb(validation.errors);
  }
  else {
    this.emit('save:before');
    this.client.MULTI()
      .HMSET(prefixId(this.id, this.namespace), this.properties, function(err) {
        if (err) {
          cb && !cb_ran && cb(err);
          cb_ran = true;
          return;
        }
      })
      .HGETALL(prefixId(this.id, this.namespace), function(err, obj) {
        if (err) {
          cb && !cb_ran && cb(err);
          cb_ran = true;
          return;
        }
        self.set(obj);
      })
      .exec(function(err, replies) {
        if (err) {
          cb && !cb_ran && cb(err);
          return;
        }
        self.emit('save:after');
        cb && cb(null, self);
      });
  }
  return this;
};

/**
 * Overwrites *all* the model's properties to a copy of the provided object.
 * Does not save the model to redis.
 *
 * @method set
 * @param attrs {Object} Properties to overwrite with.
 * @chainable
 */
RedisModel.prototype.set = function(attrs) {
  var self = this;
  self.properties = {};
  if (attrs) {
    Object.keys(attrs).forEach(function(k) {
      self.properties[k] = attrs[k];
    });
  }
  return this;
};

/**
 * Destroys the model in redis.
 *
 * Example
 * =======
 *
 *     model.destroy(function(err) {
 *       if (err) {
 *         // whoops...
 *       }
 *       // enjoy the silence
 *     });
 *
 * @method destroy
 */
RedisModel.prototype.destroy = function(cb) {
  var self = this;
  this.emit('destroy:before');
  this.client.DEL(prefixId(this.id, this.namespace), function(err) {
    if (err) {
      cb && cb(err);
      return;
    }
    cb && cb();
  });
  this.emit('destroy:after');
};

/**
 * Embeds metadata into the model's properties to notate each variable type
 * for later hydration.
 *
 * @method _dehydrate
 * @private
 * @chainable
 */
RedisModel.prototype._dehydrate = function() {
  var obj = this.toJSON();
  if (obj._types) {
    // Already dehydrated.
    return this;
  }
  obj = hydration.dehydrate(obj);
  Object.keys(obj._types).forEach(function(k) {
    if (obj._types[k] == 'object' || obj._types[k] == 'array') {
      obj[k] = JSON.stringify(obj[k]);
    }
    else if (obj._types[k] == 'date') {
      // Dates aren't JSON encoded when stored, but we still want the ISO
      // version so we can sort.
      obj[k] = obj[k].toJSON();
    }
  });
  obj._types = JSON.stringify(obj._types);
  return this.set(obj);
};

/**
 * Uses embedded metadata to apply proper types to dehydrated data.
 *
 * @method _hydrate
 * @private
 * @chainable
 */
RedisModel.prototype._hydrate = function() {
  var obj = this.properties, self = this;
  if (!obj._types) {
    // Already hydrated.
    return this;
  }
  obj._types = JSON.parse(obj._types);
  Object.keys(obj).forEach(function(k) {
    if (obj._types[k] == 'object' || obj._types[k] == 'array') {
      obj[k] = JSON.parse(obj[k]);
    }
  });
  obj = hydration.hydrate(obj);
  return this.set(obj);
};

module.exports = RedisModel;