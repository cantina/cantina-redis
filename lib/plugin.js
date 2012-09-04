var redis = require('haredis')
  , utils = require('cantina-utils')

utils.pkginfo(module);

exports.dependencies = {};

exports.defaults = {
  nodes: ['127.0.0.1:6379']
};

exports.init = function(app, done) {
  var conf = app.conf.get('redis');
  app.redis = redis.createClient(conf.nodes, conf);
  app.redis.on('error', app.emit.bind(app, 'error'));
  app.redis.once('ready', done);

  app.redis.RedisModel = require('./model');
  app.redis.RedisCollection = require('./collection');
  app.redis.module = redis;
};