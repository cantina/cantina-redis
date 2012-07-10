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
 *       { client: redis.createClient() }
 *     );
 *
 * @class RedisModel
 * @constructor
 * @extends Model
 * @param attrs {Object} Properties to instantiate the model with.
 * @param options {Object|RedisCollection} Options to apply to the model.
 *
 *   Supported options:
 *
 *   - **client** {Object} _(required)_ Redis client object. You may pass
 *     `app.client` or create a new client with `redis.createClient()`
 *   - **prefix** {String} Prefix to separate the storage of models in this
 *     collection.
 */
function RedisModel(attrs, options) {
  var self = this;

  options = options || {};
  if (!options.client) {
    if (!this.constructor.client) {
      throw new Error('Must initialize RedisModels with a redis client in options.client');
    }
    else {
      this.client = this.constructor.client;
    }
  }
  else {
    this.client = options.client;
  }

  if (options.prefix) {
    this.prefix = options.prefix;
  }

  RedisModel.super.call(this, attrs);

  this.on('save:before', function() {
    this._dehydrate();
  });
  this.on('save:after', function() {
    this._hydrate();
    this.client.SADD(this.prefixKey(), this.id);
    this.indexes.forEach(function(index) {
      if (typeof self.properties[index] != 'undefined') {
        self.client.SADD(self.prefixKey(index + ':' + self.properties[index]), self.id);
      }
    });
  });
  this.on('destroy:after', function() {
    this.client.SREM(self.prefixKey(), this.id);
    this.indexes.forEach(function(index) {
      if (typeof self.properties[index] != 'undefined') {
        self.client.SREM(self.prefixKey(index + ':' + self.properties[index]), self.id);
      }
    });
  });

  this._hydrate();

  return this;
}
utils.inherits(RedisModel, Model);

RedisModel.prototype.prefixKey = require('./prefix-key');

RedisModel.prototype.__defineGetter__('indexes', function() {
  var self = this;
  return Object.keys(this.schema.properties).filter(function(k) {
    return self.schema.properties[k].index;
  });
});

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
      .HMSET(this.prefixKey(this.id), this.properties, function(err) {
        if (err) {
          cb && !cb_ran && cb(err);
          cb_ran = true;
          return;
        }
      })
      .HGETALL(this.prefixKey(this.id), function(err, obj) {
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
  this.client.DEL(this.prefixKey(this.id), function(err) {
    if (err) {
      cb && cb(err);
      return;
    }
    self.emit('destroy:after');
    cb && cb();
  });
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
