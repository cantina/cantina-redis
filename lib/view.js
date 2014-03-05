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
var EventEmitter = require('events').EventEmitter
  , getSchema = require('./model').super.getSchema
  , inherits = require('inherits')
  , async = require('async')
  , createModel = require('./create-model')
  , RedisCollection = require('./collection')

/**
 * Represents a 'view' of models, optionally filtered.
 *
 * Example
 * =======
 *
 *     var healthy = new RedisView({
 *       name: 'healthy',
 *       models: [MyModel, MyOtherModel],
 *       client: app.redis,
 *       sort: 'calories',
 *       dir: 'DESC',
 *       cache: true,
 *       cacheSize: 100,
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
 *   - **models** {Array} _(required)_ An array of model classes. Instances of
 *     these Models will be eligible for inclusion in the view.
 *   - **sort** {String} The model property that should be used as a sort score.
 *     By default all scores will be `0`.  Note: If you specify a property it
 *     should exist on all instances of all models in the view, otherwise they
 *     will get a default score of `0`.
 *   - **dir** {String} "ASC" or "DESC"(default).  Determines the default sort
 *     order of list() and range() calls.
 *   - **cache** {Boolean} If true, the first `cacheSize` items in the view will
 *     be retrieved from memory in list() calls.
 *   - **cacheSize** {Number} The number of items to cache.
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
    throw new Error('RedisViews MUST specify a redis client in options.client');
  }
  if (!options.models || options.models.length < 1) {
    throw new Error('RedisViews MUST specify one or more collections in options.collections');
  }

  this.client = options.client;
  this.prefix = 'views';
  this.key = this.prefixKey(options.name);
  this.models = options.models;
  this.sort = options.sort || false;
  this.dir = options.dir || 'ASC';
  this.cache = options.cache || false;
  this.cacheSize = options.cacheSize || 100;
  this.filter = options.filter || false;

  // Ensure all models are sandboxed and map model schema names to classes.
  this._models = {};
  this.models.forEach(function(model, i) {
    if (!model.all) {
      self.models[i] = model = createModel(model, {client: self.client});
    }
    else if (!model.client) {
      self.models[i].client = model.client = self.client;
    }
    self._models[getSchema(model).name] = model;
  });

  // Setup model class listeners.
  this.listen();

  // Prime the cache if it is enabled.
  if (this.cache) {
    this._cache = null;
    this.primeCache();
  }

  RedisView.super.call(this);
}
inherits(RedisView, EventEmitter);

// Expose prefixKey() on views.
RedisView.prototype.prefixKey = require('./prefix-key');

/**
 * Attach listeners to the view's model classes.
 */
RedisView.prototype.listen = function() {
  var self = this;
  this.models.forEach(function(model) {
    model.all.on('save:after', self.afterSave.bind(self));
    model.all.on('destroy:after', self.afterDestroy.bind(self));
  });
};

/**
 * Handle a model 'save:after' event.
 */
RedisView.prototype.afterSave = function(model, cb) {
  var self = this,
      score = this.sort ? model.properties[this.sort] : 0,
      data = JSON.stringify({id: model.id, name: model.schema.name});

  // Add the model to the view if it passes the filter.
  if (!this.filter || this.filter(model)) {
    this.client.ZADD(this.key, score, data, function(err, count) {
      if (err) {
        self.emit('error', err);
        if(cb) cb(err);
      }
      else if (count > 0){
        self.addToCache(model);
        self.emit('model:added', model);
      }
      else {
        self.updateCache(model);
        self.emit('model:updated', model);
      }
      if(cb) cb();
    });
  }
  // Otherwise, we need to try and remove it from the view (it may have been
  // in the view previously).
  else {
    this.client.ZREM(this.key, data, function(err, count) {
      if (err) {
        self.emit('error', err);
        if(cb) cb(err);
      }
      else if (count > 0) {
        self.removeFromCache(model);
        self.emit('model:removed', model);
      }
      if(cb) cb();
    });
  }
};

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
};

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
      dir = this.dir;
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

  // Should we serve from the cache?
  if (this.cache && this._cache && (dir === this.dir) && (!skip || ((limit + skip) <= this._cache.length))) {
    return callback(null, this._cache.slice(skip, skip + limit));
  }

  // List form Redis.
  this.client[this._cmd(dir)](this.key, skip, skip + limit, function(err, results) {
    if (err) return callback(err);
    self._hydrate(results, callback);
  });
};

/**
 * Convert redis query results to models.
 */
RedisView.prototype._hydrate = function(results, callback) {
  var self = this;
  var tasks = [];

  results.forEach(function(result, i) {
    result = JSON.parse(result);
    tasks.push(function(done) {
      var Model = self._models[result.name];
      var model = new Model();
      model.id = result.id;
      model.load(function(err, model) {
        if (err) return done(err);
        results[i] = model;
        done();
      });
    });
  });

  async.parallel(tasks, function(err) {
    if (err) return callback(err);
    callback(null, results);
  });
};

/**
 * Destroy a view.
 */
RedisView.prototype.destroy = function(cb) {
  var self = this;
  this.emit('destroy:before');
  this.client.DEL(this.key, function(err) {
    if (err) {
      if(cb) cb(err);
      return;
    }
    self.emit('destroy:after');
    if(cb) cb();
  });
};

/**
 * Repopulate a view based on existing models.
 *
 * WARNING: Slow if your collection has a lot of models.
 */
RedisView.prototype.repopulate = function(callback) {
  var self = this,
      tasks = [];

  // Destroy the view.
  this.destroy(function(err) {
    if (err) return callback(err);

    // Load models and invoke the afterSave on them.
    self.models.forEach(function(model) {
      var col = new RedisCollection({model: model});
      tasks.push(function(done) {
        col.find({}, function(err, models) {
          if (err) return done(err);
          async.forEachLimit(models, 20, function (model, next) {
            self.afterSave(model, next);
          }, done);
        });
      });
    });

    async.parallel(tasks, callback);
  });
};

/**
 * Prime the cache.
 */
RedisView.prototype.primeCache = function() {
  var self = this;

  this.list(this.cacheSize, function(err, models) {
    if (err) throw new Error('Error listing ' + self.name + ' view for cache priming');
    self._cache = [];
    models.forEach(function(model) {
      self._cache.push(model);
    });
    self.sortCache();
  });
};

/**
 * Add a model to the cache.
 */
RedisView.prototype.addToCache = function(model) {
  var self = this;
  if (self.cache) {
    self._cache.push(model);
    self.sortCache();
    if (self._cache.length > self.cacheSize) {
      self._cache.pop();
    }
  }
};

/**
 * Remove a model from the cache.
 */
RedisView.prototype.removeFromCache = function(model) {
  var self = this;
  if (self.cache) {
    self._cache.forEach(function(check, key) {
      if (model.id === check.id) {
        self._cache.splice(key, 1);
      }
    });
    self.sortCache();
  }
};

/**
 * An item in the cache was updated.
 */
RedisView.prototype.updateCache = function(model) {
  var self = this;
  if (self.cache) {
    self._cache.forEach(function(check, key) {
      if (model.id === check.id) {
        self._cache[key] = model;
      }
    });
    self.sortCache();
  }
};

/**
 * Re-sort the cache.
 */
RedisView.prototype.sortCache = function() {
  var self = this;
  if (this.cache && this.sort) {
    this._cache.sort(function(a, b) {
      if (self.dir === 'DESC') {
        var temp = a;
        a = b;
        b = temp;
      }
      if (a.properties[self.sort] < b.properties[self.sort]){
        return -1;
      }
      if (a.properties[self.sort] > b.properties[self.sort]) {
        return 1;
      }
      return 0;
    });
  }
};

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
};

module.exports = RedisView;
