var app = require('cantina'),
    redis = require('haredis');

app.conf.add({
  redis: {
    nodes: ['127.0.0.1:6379']
  }
});

app.on('init', function (done) {
  var conf = app.conf.get('redis');
  if (typeof conf === 'string') {
    conf = { nodes: [conf] };
  }
  else if (Array.isArray(conf)) {
    conf = { nodes: conf };
  }
  app.redis = redis.createClient(conf.nodes, conf);
  app.redis.on('error', app.emit.bind(app, 'error'));
  app.redis.once('connect', done);

  app.redis.module = redis;
  app.redis.RedisModel = require('./lib/model');
  app.redis.createModel = require('./lib/create-model');
  app.redis.createClient = redis.createClient;
  app.redis.RedisCollection = require('./lib/collection');
  app.redis.RedisView = require('./lib/view');
  app.redis.destroyAll = require('./lib/destroy-all');
});
