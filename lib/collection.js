/**
 * RedisCollection
 * ---------------
 *
 * Provides methods to work with collections of RedisModels which share a
 * namespace and schema.
 *
 * @module cantina
 * @submodule redis
 * @exports {Function} RedisCollection constructor
 * @requires cantina, RedisModel, EventEmitter, prefixId, async, hydration,
 *   inherits
 */
var utils = require('cantina-utils')
  , RedisModel = require('./model')
  , EventEmitter = require('events').EventEmitter
  , prefixId = require('./prefix-id')
  , hydration = require('hydration')
  ;

/**
 * Represents a collection of RedisModels which share a namsepace and schema,
 * enabling them to be saved, indexed and queried in a unified manner.
 *
 * Example
 * =======
 *
 *     var coll = new RedisCollection({
 *       client: redis.createClient(),
 *       namespace: 'users',
 *       schema: {
 *         name: {type: 'string', required: true},
 *         email: {type: 'string', format: 'email', index: true, required: true}
 *       }
 *     });
 *
 * @class RedisCollection
 * @constructor
 * @extends EventEmitter
 * @param options {Object} Options for the collection
 *
 *   Supported options:
 *
 *   - **client** {Object} _(required)_ Redis client object. You may pass
 *     `app.client` or create a new client with `redis.createClient()`
 *   - **namespace** {String} Prefix to separate the storage of models in this
 *     collection. Default: `generic`
 *   - **schema** {Object} [JSON schema](http://json-schema.org/) to validate
 *     against.
 *   - **indexes** {Array} List of properties to make findable. May also be passed
 *     through `schema` by setting `index: true` on a property. Do not use both!
 *   - **model** {Function} Constructor for models in this collection.
 *     Default: `RedisModel`
 */
function RedisCollection(options) {
  RedisCollection.super.call(this);

  options = options || {};
  utils.defaults(options, {
    namespace: 'generic',
    schema: {},
    indexes: [],
    model: RedisModel
  });

  utils.defaults(this, options);

  if (!this.client) {
    throw new Error('Must call RedisCollection#init() with a redis client in options.client');
  }

  for (var k in this.schema) {
    if (this.schema[k].index) {
      this.indexes.push(k);
    }
  }

  return this;
}
utils.inherits(RedisCollection, EventEmitter);

/**
 * Attempt to create a persistent model with the given properties, inheriting
 * the collection's namespace and schema. If validation fails, `cb` will be
 * passed validation errors. Otherwise the new model will be passed to `cb`.
 *
 * Example
 * =======
 *
 *     coll.create({name: 'Joe', email: 'joe@joe.com'}, function(err, model) {
 *       if (err) {
 *         // err can be a validation object or redis exception!
 *       }
 *       // new model saved on server
 *     });
 *
 * @param attrs {Object} Data for the new model. Can include standard javascript
 *   types such as Object, Array, Date and RegExp, but should not include
 *   instances of custom classes or recursive references.
 *
 * @method create
 * @param [cb] {Function} Callback to handle errors and receive new model.
 * @chainable
 */
RedisCollection.prototype.create = function(attrs, cb) {
  var model = new this.model(attrs, this).save(cb);
  return this;
};

/**
 * Get a model by ID from redis.
 *
 * Example
 * =======
 *
 *     coll.get('1234', function(err, model) {
 *       if (err) {
 *         // deal with err
 *       }
 *       // work with model
 *     });
 *
 * @method get
 * @param id {String|Number} ID of model to fetch, corresponding to
 *   `model.properties[model.key]`.
 * @param cb {Function} Callback to handle errors and receive the model.
 * @chainable
 */
RedisCollection.prototype.get = function(id, cb) {
  var self = this;
  this.client.HGETALL(prefixId(id, this.namespace), function(err, obj) {
    if (err) {
      return cb(err);
    }
    if (!obj) {
      return cb(null, null);
    }

    cb(null, new self.model(obj, self));
  });
  return this;
};

/**
 * Find a model with the given ID, and update it with the provided
 * (incomplete) properties.
 *
 * Example
 * =======
 *
 *     coll.update('1234', {email: 'joe@gmail.com'}, function(err, model) {
 *       if (err) {
 *         // deal with err
 *       }
 *       // work with updated model
 *     });
 *
 * @method find
 * @param id {String|Number} ID of model to update, corresponding to
 *   `model.properties[model.key]`.
 * @param attrs {Object} Data for the new model. Can include standard javascript
 *   types such as Object, Array, Date and RegExp, but should not include
 *   instances of custom classes or recursive references.
 * @param cb {Function} Callback to handle errors and receive the updated model.
 * @chainable
 */
RedisCollection.prototype.update = function(id, attrs, cb) {
  var self = this;
  this.get(id, function(err, model) {
    if (err) {
      return cb(err);
    }
    Object.keys(attrs).forEach(function(k) {
      model.properties[k] = attrs[k];
    });
    model.save(cb);
  });
  return this;
};

/**
 * Find models in the collection, optionally using an indexed value
 * and sort/limit.
 *
 * Example
 * =======
 *
 *     coll.indexes.push('color');
 *     coll.create({color: 'red'}, function(err, model) {
 *       if (err) {
 *         // handle error
 *       }
 *       coll.find({color: 'red'}, function(err, result) {
 *         if (err) {
 *           // handle error
 *         }
 *         // result is an array which should contain the model we created
 *       });
 *     });
 *
 * @method find
 * @param query {Object} Query object. Must be an empty object literal (returns
 *   all records) or a single `key: value` pair, corresponding to an indexed
 *   property of the collection.
 * @param [options] {Object} Options for the query.
 *
 *   Supported options:
 *
 *   - **sort** {String} Property name to sort by. Does not require an index.
 *   - **desc** {Boolean} Set to `true` to sort descending.
 *   - **alpha** {Boolean} Set to `true` to sort lexigraphically (defaults to numeric sort)
 *   - **limit** {Number} Limits the result count.
 *   - **skip** {Number} Number of records to omit at the start of the results.
 *
 * @param cb {Function} Callback to handle errors and receive results (array
 *   of models).
 * @chainable
 */
RedisCollection.prototype.find = function(query, options, cb) {
  var self = this, key, value, args = [];

  if (arguments.length == 2 && typeof options == 'function') {
    cb = options;
    options = {};
  }

  var keys = Object.keys(query);
  if (keys.length == 1) {
    // Use the namespace:index:value set
    keys.forEach(function(k) {
      args.push(prefixId(k + ':' + query[k], self.namespace));
    });
  }
  else if (keys.length == 0) {
    // Use the namespace set
    args.push(prefixId(null, this.namespace));
  }
  else {
    throw new Error('Multiple conditions in query not supported yet');
  }

  args.push('BY');

  if (!options.sort) {
    args.push('NOSORT');
  }
  else {
    args.push(prefixId('*->' + options.sort, this.namespace));
  }
  if (options.limit) {
    args.push('LIMIT');
    if (!options.skip) {
      options.skip = 0;
    }
    args.push(options.skip);
    args.push(options.limit);
  }
  if (options.sort && options.desc) {
    args.push('DESC');
  }
  if (options.sort && options.alpha) {
    args.push('ALPHA');
  }
  args.push(function(err, ids) {
    if (err) {
      return cb(err);
    }
    self.getall(ids, cb);
  });

  this.client.SORT.apply(this.client, args);

  return this;
};

/**
 * Get models from an array of IDs.
 *
 * Example
 * =======
 *
 *     coll.getall(['1234', '54321'], function(err, result) {
 *       if (err) {
 *         // handle error
 *       }
 *       // result should be an array of 2 models
 *     });
 *
 * @method getall
 * @param ids {Array} IDs of models to fetch.
 * @param cb {Function} Callback to handle errors and receive results (array
 *   of models).
 * @chainable
 */
RedisCollection.prototype.getall = function(ids, cb) {
  var self = this, tasks = [];
  ids.forEach(function(id) {
    tasks.push(function(done) { self.get(id, done); });
  });
  utils.async.parallel(tasks, cb);
  return this;
};

module.exports = RedisCollection;