var cantina = require('cantina')
  , RedisModel = require('./model')
  , EventEmitter = require('events').EventEmitter
  , prefixId = require('./prefix')
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
    modelConstructor: RedisModel
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

RedisCollection.prototype.get = function(id, cb) {
  var self = this;
  this.client.HGETALL(prefixId(id, this.namespace), function(err, obj) {
    if (err) {
      return cb(err);
    }
    if (!obj) {
      return cb(null, null);
    }
    cb(null, (new self.modelConstructor).init(obj, self));
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
    model.save
    var validation = model.validate();
    if (!validation.valid) {
      return cb(validation.errors);
    }
    self.client.HMSET(prefixId(model.id, self.namespace), model.toJSON(), function(err) {
      if (err) {
        return cb(err);
      }
      self.get(model.id, cb);
    });
  });
};

module.exports = RedisCollection;