var cantina = require('cantina')
  , EventEmitter = require('events').EventEmitter
  , Model = require('cantina-model').Model
  , prefixId = require('./prefix-id')
  , hydration = require('hydration')
  , inherits = require('inherits')
  ;

function RedisModel(attrs, options) {
  if (!options.client) {
    throw new Error('Must call RedisModel#init() with a redis client in options.client');
  }

  cantina.utils.defaults(options, {
    namespace: 'generic',
    indexes: []
  });

  RedisModel.super.call(this, attrs, options);

  var self = this;

  this.on('save:before', function() {
    this.dehydrate();
  });
  this.on('save:after', function() {
    this.hydrate();
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
}
inherits(RedisModel, Model);

RedisModel.prototype.save = function(cb) {
  var self = this, cb_ran = false;
  var validation = this.validate();
  if (!validation.valid) {
    cb && cb(validation.errors);
  }
  else {
    this.emit('save:before');
    this.client.MULTI()
      .HMSET(prefixId(this.id, this.namespace), this.properties, function(err) {
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
        self.set(obj);
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

RedisModel.prototype.dehydrate = function() {
  var obj = this.toJSON();
  if (obj._types) {
    // Already dehydrated.
    return this;
  }
  obj = hydration.dehydrate(obj);
  Object.keys(obj._types).forEach(function(k) {
    if (obj._types[k] == 'object' || obj._types[k] == 'array') {
      obj[k] = JSON.stringify(obj[k]);
    }
    else if (obj._types[k] == 'date') {
      // Dates aren't JSON encoded when stored, but we still want the ISO
      // version so we can sort.
      obj[k] = obj[k].toJSON();
    }
  });
  obj._types = JSON.stringify(obj._types);
  return this.set(obj);
};

RedisModel.prototype.set = function(attrs) {
  var self = this;
  self.properties = {};
  if (attrs) {
    Object.keys(attrs).forEach(function(k) {
      self.properties[k] = attrs[k];
    });
  }
  return this;
};

RedisModel.prototype.hydrate = function() {
  var obj = this.properties, self = this;
  if (!obj._types) {
    // Already hydrated.
    return this;
  }
  obj._types = JSON.parse(obj._types);
  Object.keys(obj).forEach(function(k) {
    if (obj._types[k] == 'object' || obj._types[k] == 'array') {
      obj[k] = JSON.parse(obj[k]);
    }
  });
  obj = hydration.hydrate(obj);
  return this.set(obj);
};

RedisModel.prototype.destroy = function(cb) {
  var self = this;
  this.emit('destroy:before');
  this.client.DEL(prefixId(this.id, this.namespace), function(err) {
    if (err) {
      cb && cb(err);
      return;
    }
    cb && cb();
  });
  this.emit('destroy:after');
};

module.exports = RedisModel;