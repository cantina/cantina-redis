var redis = require('haredis')

exports.name = 'redis';

exports.defaults = {
  nodes: ['127.0.0.1:6379']
};

exports.RedisModel = require('./lib/model');
exports.createModel = require('./lib/create-model');
exports.createClient = redis.createClient;
exports.RedisCollection = require('./lib/collection');
exports.RedisView = require('./lib/view');
exports.destroyAll = require('./lib/destroy-all');
exports.module = redis;

exports.init = function (app, done) {
  var conf = app.conf.get('redis');
  app.redis = redis.createClient(conf.nodes, conf);
  app.redis.on('error', app.emit.bind(app, 'error'));
  app.redis.once('ready', done);

  Object.keys(exports).forEach(function (k) {
    if (typeof app.redis[k] === 'undefined') {
      app.redis[k] = exports[k];
    }
  });

  done();
};
