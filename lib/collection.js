var cantina = require('cantina')
  , RedisModel = require('./model')
  , EventEmitter = require('events').EventEmitter
  , prefixId = require('./prefix')
  , async = require('async')
  ;

function RedisCollection() {};
RedisCollection.prototype = new EventEmitter;

RedisCollection.prototype.init = function(options) {
  EventEmitter.call(this);

  options = options || {};
  cantina.utils.defaults(options, {
    namespace: 'generic',
    schema: {},
    indexes: [],
    model: RedisModel
  });

  cantina.utils.defaults(this, options);

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

RedisCollection.prototype.create = function(attrs, cb) {
  var model = new RedisModel;
  model.init(attrs, this);
  model.save(cb);
  return this;
};

RedisCollection.prototype.get = function(id, cb) {
  var self = this;
  this.client.HGETALL(prefixId(id, this.namespace), function(err, obj) {
    if (err) {
      return cb(err);
    }
    if (!obj) {
      return cb(null, null);
    }
    var model = new RedisModel;
    model.init(obj, self);
    cb(null, model);
  });
  return this;
};

RedisCollection.prototype.update = function(id, attrs, cb) {
  var self = this;
  this.get(id, function(err, model) {
    if (err) {
      return cb(err);
    }
    Object.keys(attrs).forEach(function(k) {
      model.properties[k] = attrs[k];
    });
    model.save(function(err) {
      if (err) {
        return cb(err);
      }
      cb(null, model);
    });
  });
  return this;
};

RedisCollection.prototype.find = function(query, options, cb) {
  var self = this, key, value;

  if (arguments.length == 2) {
    cb = options;
    options = {};
  }

  var keys = Object.keys(query);
  if (keys.length > 1) {
    throw new Error('Multiple conditions in query not supported yet');
  }
  keys.forEach(function(k) {
    key = k;
    value = query[k];
  });

  this.client.SMEMBERS(prefixId(key + ':' + JSON.stringify(value), this.namespace), function(err, ids) {
    if (err) {
      return cb(err);
    }
    self.getall(ids, cb);
  });

  return this;
};

RedisCollection.prototype.getall = function(ids, cb) {
  var self = this, tasks = [];
  ids.forEach(function(id) {
    tasks.push(function(done) { self.get(id, done); });
  });
  async.parallel(tasks, cb);
  return this;
};

module.exports = RedisCollection;