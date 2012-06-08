var cantina = require('cantina')
  , EventEmitter = require('events').EventEmitter
  , Model = require('cantina-model').Model
  , prefixId = require('./prefix')
  ;

function RedisModel() {};
RedisModel.prototype = new Model;

RedisModel.prototype.init = function(attrs, options) {
  if (!options.client) {
    throw new Error('Must call RedisModel#init() with a redis client in options.client');
  }

  cantina.utils.defaults(options, {
    namespace: 'generic',
    indexes: []
  });
  Model.prototype.init.call(this, attrs, options);

  if (this.indexes.length) {
    this.on('save:after', function(model) {
      for (var k in model.indexes) {
        model.client.SADD(prefixId('index:' + k, model.namespace), model.id);
      }
    });
  }

  return this;
};

RedisModel.prototype.save = function(cb) {
  var self = this;
  var validation = this.validate();
  if (!validation.valid) {
    cb && cb(validation.errors);
  }
  else {
    this.emit('save:before');
    this.client.HMSET(prefixId(this.id, this.namespace), this.toJSON(), function(err) {
      if (err) {
        cb && cb(err);
        return;
      }
      self.emit('save:after');
      cb(null, self);
    });
  }
  return this;
};

RedisModel.prototype.destroy = function(cb) {
  var self = this;
  this.client.DEL(prefixId(this.id, this.namespace), cb || function(err) {
    if (err) {
      self.emit('error', err);
    }
  });
};

module.exports = RedisModel;