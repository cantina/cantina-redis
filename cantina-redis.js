var redis = require('haredis');

module.exports = function (app) {
  // Get conf.
  var conf = app.conf.get('redis') || {};

  // Massage conf.
  if (typeof conf === 'string') {
    conf = { nodes: [conf] };
  }
  else if (Array.isArray(conf)) {
    conf = { nodes: conf };
  }
  else if (!conf.nodes) {
    conf.nodes = ['127.0.0.1:6379'];
  }

  // Ensure a prefix.
  if (!conf.prefix) {
    conf.prefix = 'cantina';
  }

  // Create client.
  app.redis = redis.createClient(conf.nodes, conf);
  app.redis.module = redis;

  // Pass errors to the app.
  app.redis.on('error', app.emit.bind(app, 'error'));

  // Create a prefixed key.
  app.redisKey = function () {
    return conf.prefix.concat(':' + Array.prototype.slice.call(arguments).join(':'));
  };
};