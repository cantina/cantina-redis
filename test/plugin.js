/**
 * test/plugin.js - Tests for Cantina Redis.
 */

var assert = require('assert')
  , cantina = require('cantina')
  , RedisModel = require('../').RedisModel
  , RedisCollection = require('../').RedisCollection
  ;

describe('Cantina Redis', function() {
  var app, coll;
  before(function() {
    app = cantina.createApp({
      name: 'cantina-redis-test',
      silent: true,
      amino: false
    });
    app.use(require('../').plugin);
    coll = new RedisCollection().init({client: app.redis});
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

  var myModel;
  it('can get the model', function(done) {
    coll.get(myId, function(err, model) {
      assert.ok(model, 'got a model back');
      assert.strictEqual(model.id, myId);
      assert.strictEqual(model.properties.name, 'carlos');
      myModel = model;
      done();
    });
  });

  it('can destroy the model', function(done) {
    myModel.destroy(function(err) {
      assert.ifError(err);
      coll.get(myId, function(err, model) {
        assert.ifError(err);
        assert.strictEqual(model, null, 'model was deleted');
        done();
      });
    });
  });
});