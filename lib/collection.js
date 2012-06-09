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
  return (new this.model).init(attrs, this).save(cb);
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
    cb(null, (new self.model).init(obj, self));
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

RedisCollection.prototype.getall = function(ids, cb) {
  var self = this, tasks = [];
  ids.forEach(function(id) {
    tasks.push(function(done) { self.get(id, done); });
  });
  async.parallel(tasks, cb);
  return this;
};

module.exports = RedisCollection;