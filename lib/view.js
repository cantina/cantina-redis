/**
 * RedisView
 * ---------------
 *
 * Create 'views' that are a sorted set of model ids, optionally run through a
 * filter function.
 *
 * @module cantina
 * @submodule redis
 * @exports {Function} RedisView constructor
 * @requires cantina-utils, RedisModel, RedisCollection, EventEmitter
 */
var utils = require('cantina-utils')
  , EventEmitter = require('events').EventEmitter
  ;

/**
 * Represents a 'view' of models, optionally filtered.
 *
 * Example
 * =======
 *
 *     var healthy = new RedisView({
 *       name: 'healthy',
 *       collections: [MyCollection, MyOtherCollection],
 *       client: app.redis,
 *       sort: 'calories',
 *       dir: 'DESC',
 *       filter: function(model) {
 *         if (model.properties.isHealthy) {
 *           return true;
 *         }
 *         else {
 *           return false;
 *         }
 *       }
 *     });
 *
 * @class RedisView
 * @constructor
 * @extends EventEmitter
 * @param options {Object} Options for the collection
 *
 *   Supported options:
 *
 *   - **name** {String} _(required)_ Unique name for the view.
 *   - **client** {Object} _(required)_ Redis client object. You may pass
 *     `app.client` or create a new client with `redis.createClient()`
 *   - **collections** {Array} _(required)_ An array of collection instances.
 *     Models related to the collections will be eligible for inclusion in
 *     the view.
 *   - **sort** {String} The model property that should be used as a sort score.
 *     By default all scores will be `0`.  Note: If you specify a property it
 *     should exist on all instances of all models in the view, otherwise they
 *     will get a default score of `0`.
 *   - **dir** {String} "ASC" or "DESC"(default).  Determines the default sort
 *     order of list() and range() calls.
 *   - **filter** {Function} A function to filter models before they are added
 *     to the view. Filter functions should accept a model param and return a
 *     boolean.
 */
function RedisView(options) {
  var self = this;

  if (!options.name) {
    throw new Error('RedisViews MUST specify a unique name in options.name');
  }
  if (!options.client) {
    throw new Error('RedisViews MUST specify a redis client in options.client');;
  }
  if (!options.collections || options.collections.length < 1) {
    throw new Error('RedisViews MUST specify one or more collections in options.collections');
  }

  this.client = options.client;
  this.prefix = 'views';
  this.key = this.prefixKey(options.name);
  this.collections = options.collections;
  this.sort = options.sort || false;
  this.dir = options.dir || 'ASC';
  this.filter = options.filter || false;

  // Map collection schema names to instances.
  this._collections = {};
  this.collections.forEach(function(col) {
    self._collections[col.schema.name] = col;
  });

  // Setup model class listeners.
  this.listen();

  RedisView.super.call(this);
}
utils.inherits(RedisView, EventEmitter);

// Expose prefixKey() on views.
RedisView.prototype.prefixKey = require('./prefix-key');

/**
 * Attach listeners to the view's model classes.
 */
RedisView.prototype.listen = function() {
  var self = this;
  this.collections.forEach(function(col) {
    col.model.all.on('save:after', self.afterSave.bind(self));
    col.model.all.on('destroy:after', self.afterDestroy.bind(self));
  });
}

/**
 * Handle a model 'save:after' event.
 */
RedisView.prototype.afterSave = function(model) {
  var self = this,
      score = this.sort ? model.properties[this.sort] : 0,
      data = JSON.stringify({id: model.id, name: model.schema.name});

  // Add the model to the view if it passes the filter.
  if (!this.filter || this.filter(model)) {
    this.client.ZADD(this.key, score, data, function(err, count) {
      if (err) {
        self.emit('error', err);
      }
      else if (count > 0){
        self.emit('model:added', model);
      }
      else {
        self.emit('model:updated', model);
      }
    });
  }
  // Otherwise, we need to try and remove it from the view (it may have been
  // in the view previously).
  else {
    this.client.ZREM(this.key, data, function(err, count) {
      if (err) {
        self.emit('error', err);
      }
      else if (count > 0) {
        self.emit('model:removed', model);
      }
    });
  }
}

/**
 * Handle a model 'destroy:after' event.
 */
RedisView.prototype.afterDestroy = function(model) {
  var self = this;
  var data = JSON.stringify({id: model.id, name: model.schema.name});
  this.client.ZREM(this.key, data, function(err) {
    if (err) {
      self.emit('error', err);
    }
    else {
      self.emit('model:removed', model);
    }
  });
}

/**
 * List models in the view.
 */
RedisView.prototype.list = function(limit, skip, dir, callback) {
  var self = this;
  switch(arguments.length) {
    case 1:
      callback = limit;
      limit = 10;
      skip = 0;
      dir = this.dir
      break;

    case 2:
      callback = skip;
      skip = 0;
      dir = this.dir;
      break;

    case 3:
      callback = dir;
      dir = this.dir;
      break;
  }
  this.client[this._cmd(dir)](this.key, skip, skip + limit, function(err, results) {
    if (err) return callback(err);
    self._hydrate(results, callback);
  });
}

/**
 * Convert redis query results to models.
 */
RedisView.prototype._hydrate = function(results, callback) {
  var self = this;
  var tasks = [];

  results.forEach(function(result, i) {
    result = JSON.parse(result);
    tasks.push(function(done) {
      self._collections[result.name].get(result.id, function(err, model) {
        if (err) return done(err);
        results[i] = model;
        done();
      });
    });
  });

  utils.async.parallel(tasks, function(err) {
    if (err) return callback(err);
    callback(null, results);
  });
}

/**
 * Destroy a view.
 */
RedisView.prototype.destroy = function(cb) {
  var self = this;
  this.emit('destroy:before');
  this.client.DEL(this.key, function(err) {
    if (err) {
      cb && cb(err);
      return;
    }
    self.emit('destroy:after');
    cb && cb();
  });
}

/**
 * Convert a 'dir' string to the actual redis command for lists.
 */
RedisView.prototype._cmd = function(dir, byscore) {
  byscore = byscore || false;
  if (dir === 'ASC') {
    return byscore ? 'ZRANGEBYSCORE' : 'ZRANGE';
  }
  else {
    return byscore ? 'ZREVRANGEBYSCORE' : 'ZREVRANGE';
  }
}

module.exports = RedisView;
