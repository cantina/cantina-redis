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
    namespace: '',
    bucket: 'generic',
    schema: {},
    modelConstructor: RedisModel
  });

  cantina.utils.defaults(this, options);

  if (!this.client) {
    this.emit('error', 'Must call RedisCollection#init() with a redis client in options.client');
  }

  return this;
}

RedisCollection.prototype.get = function(id, cb) {
  var self = this;
  this.client.HGETALL(prefixId(id, this), function(err, obj) {
    if (err) {
      return cb(err);
    }
    if (!obj) {
      return cb(null, null);
    }
    return cb(null, (new self.modelConstructor).init(obj, self));
  });
  return this;
};

module.exports = RedisCollection;