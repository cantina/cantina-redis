/**
 * test/plugin.js - Tests for Cantina Redis.
 */

var assert = require('assert')
  , cantina = require('cantina')
  , RedisModel = require('../').RedisModel
  , RedisCollection = require('../').RedisCollection
  ;

describe('Cantina Redis', function() {
  var app;
  before(function() {
    app = cantina.createApp({
      name: 'cantina-redis-test',
      silent: true,
      amino: false
    });
    app.use(require('../').plugin);
  });

  var myId;
  it('can create a model', function(done) {
    var model = new RedisModel().init({name: 'carlos'}, {client: app.redis});
    model.save(function(err) {
      myId = model.id;
      assert.ok(myId);
      done(err);
    });
  });

  it('can get the model', function(done) {
    var coll = new RedisCollection().init({client: app.redis});
    coll.get(myId, function(err, model) {
      assert.ok(model, 'got a model back');
      assert.strictEqual(model.id, myId);
      assert.strictEqual(model.properties.name, 'carlos');
      done();
    });
  });
});