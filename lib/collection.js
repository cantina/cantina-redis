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
 * @requires cantina-utils, RedisModel, EventEmitter
 */
var utils = require('cantina-utils')
  , lib = require('../')
  , EventEmitter = require('events').EventEmitter
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
 *       model: Fruit
 *     });
 *
 * @class RedisCollection
 * @constructor
 * @extends EventEmitter
 * @param options {Object} Options for the collection
 *
 *   Supported options:
 *
 *   - **client** {Object} Redis client object. You may pass `app.client` or
 *     create a new client with `redis.createClient()`.  If options.model
 *     has a client can be used as well.
 *   - **model** {Function} Constructor for models in this collection.
 *     Default: `RedisModel`
 */
function RedisCollection(options) {
  if (!(options.client || (options.model && options.model.client))) {
    throw new Error('Instantiating redis collections requires a redis client in options.client');
  }

  this.client = options.client || options.model.client;

  if (options.prefix) {
    this.prefix = options.prefix;
  }

  // Setup up the model, making sure it is sandboxed and has the redis client
  // attached.
  this.model = options.model || lib.RedisModel;
  if (!this.model.all) {
    this.model = lib.createModel(this.model, { client: this.client });
  }
  else if (!this.model.client) {
    this.model.client = this.client;
  }

  this.schema = lib.RedisModel.super.getSchema(this.model);

  RedisCollection.super.call(this);
}
utils.inherits(RedisCollection, EventEmitter);

RedisCollection.prototype.prefixKey = require('./prefix-key');

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
  var model = new this.model(attrs).save(cb);
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
  var model = new this.model();
  model.id = id;
  model.load(function(err, model) {
    if (err) {
      return cb(err);
    }
    if (!model) {
      return cb(null, null);
    }
    cb(null, model);
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
      args.push(self.prefixKey(k + ':' + query[k]));
    });
  }
  else if (keys.length == 0) {
    // Use the namespace set
    args.push(self.prefixKey());
  }
  else {
    throw new Error('Multiple conditions in query not supported yet');
  }

  args.push('BY');

  if (!options.sort) {
    args.push('NOSORT');
  }
  else {
    args.push(self.prefixKey('*->' + options.sort));
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
 * Find one model in the collection, optionally using an indexed value
 * and sort/skip.
 *
 * Example
 * =======
 *
 *     coll.create({color: 'red'}, function(err, model) {
 *       if (err) {
 *         // handle error
 *       }
 *       coll.findOne({color: 'red'}, function(err, model) {
 *         if (err) {
 *           // handle error
 *         }
 *         // `model` is the found record.
 *       });
 *     });
 *
 * @method findOne
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
 *   - **skip** {Number} Number of records to omit at the start of the results.
 *
 * @param cb {Function} Callback to handle errors and receive results (array
 *   of models).
 * @chainable
 */
RedisCollection.prototype.findOne = function(query, options, cb) {
  var self = this;

  if (arguments.length == 2 && typeof options == 'function') {
    cb = options;
    options = {};
  }

  options.limit = 1;

  this.find(query, options, function(err, results) {
    if (err) return cb(err);
    cb(null, results.pop());
  });
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
