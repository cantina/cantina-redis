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
    namespace: 'generic'
  });
  return Model.prototype.init.call(this, attrs, options);
};

RedisModel.prototype.save = function(cb) {
  var self = this;
  var validation = this.validate();
  if (!validation.valid) {
    return cb(validation.errors);
  }
  this.client.HMSET(prefixId(this.id, this.namespace), this.toJSON(), cb || function(err) {
    if (err) {
      self.emit('error', err);
    }
  });
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

RedisModel.prototype.sync = function(cb) {
  this.client.HGETALL(prefixId(this.id, this.namespace), function(err, obj) {
    if (obj) {
      var self = this;
      Object.keys(obj).forEach(function(val, k) {
        self.properties[k] = val;
      });
    }
  });
  return this;
};

module.exports = RedisModel;