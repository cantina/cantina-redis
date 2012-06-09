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

  this.on('save:after', function() {
    this.client.SADD(prefixId(null, this.namespace), this.id);
    var self = this;
    this.indexes.forEach(function(index) {
      self.client.SADD(prefixId(index + ':' + self.properties[index], self.namespace), self.id);
    });
  });
  this.on('destroy:after', function() {
    this.client.SREM(prefixId(null, this.namespace), this.id);
    var self = this;
    this.indexes.forEach(function(index) {
      self.client.SREM(prefixId(index + ':' + self.properties[index], self.namespace), self.id);
    });
  });

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
  this.emit('destroy:before');
  this.client.DEL(prefixId(this.id, this.namespace), function(err) {
    if (err) {
      cb && cb(err);
      return;
    }
    self.emit('destroy:after');
    cb(null, self);
  });
  this.emit('destroy:after');
};

module.exports = RedisModel;