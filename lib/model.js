var cantina = require('cantina')
  , EventEmitter = require('events').EventEmitter
  , Model = require('cantina-model').Model
  , prefixId = require('./prefix')
  , hydration = require('hydration')
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

  var self = this;

  this.on('save:after', function() {
    this.client.SADD(prefixId(null, this.namespace), this.id);
    this.indexes.forEach(function(index) {
      if (typeof self.properties[index] != 'undefined') {
        self.client.SADD(prefixId(index + ':' + self.properties[index], self.namespace), self.id);
      }
    });
  });
  this.on('destroy:after', function() {
    this.client.SREM(prefixId(null, this.namespace), this.id);
    this.indexes.forEach(function(index) {
      if (typeof self.properties[index] != 'undefined') {
        self.client.SREM(prefixId(index + ':' + self.properties[index], self.namespace), self.id);
      }
    });
  });

  return this;
};

RedisModel.prototype.save = function(cb) {
  var self = this, cb_ran = false;
  var validation = this.validate();
  if (!validation.valid) {
    cb && cb(validation.errors);
  }
  else {
    this.emit('save:before');
    var obj = this.toJSON();
    obj = hydration.dehydrate(obj);
    Object.keys(obj).forEach(function(k) {
      if (typeof obj[k] == 'object' || typeof obj[k] == 'array') {
        obj[k] = JSON.stringify(obj[k]);
      }
    });
    this.client.MULTI()
      .HMSET(prefixId(this.id, this.namespace), obj, function(err) {
        if (err) {
          cb && !cb_ran && cb(err);
          cb_ran = true;
          return;
        }
      })
      .HGETALL(prefixId(this.id, this.namespace), function(err, obj) {
        if (err) {
          cb && !cb_ran && cb(err);
          cb_ran = true;
          return;
        }
        obj._types = JSON.parse(obj._types);
        Object.keys(obj).forEach(function(k) {
          if (obj._types[k] == 'object' || obj._types[k] == 'array') {
            obj[k] = JSON.parse(obj[k]);
          }
        });
        obj = hydration.hydrate(obj);
        Object.keys(obj).forEach(function(k) {
          self.properties[k] = obj[k];
        });
      })
      .exec(function(err, replies) {
        if (err) {
          cb && !cb_ran && cb(err);
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
    cb(null, self);
  });
  this.emit('destroy:after');
};

module.exports = RedisModel;