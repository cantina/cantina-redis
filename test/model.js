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
      assert.ifError(err);
      myId = model.id;
      assert.ok(myId);
      done(err);
    });
  });

  var myModel;
  it('can get the model', function(done) {
    coll.get(myId, function(err, model) {
      assert.ifError(err);
      assert.ok(model, 'got a model back');
      assert.strictEqual(model.id, myId);
      assert.strictEqual(model.properties.name, 'carlos');
      done();
    });
  });

  it('can update the model', function(done) {
    coll.update(myId, {name: 'scooby'}, function(err, model) {
      assert.ifError(err);
      assert.ok(model, 'got a model back');
      assert.strictEqual(model.id, myId);
      assert.strictEqual(model.properties.name, 'scooby');
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

  it('can run before/after hooks', function(done) {
    var model = new RedisModel().init({name: 'buster'}, {client: app.redis});
    model.on('save:before', function(model) {
      this.properties.job = 'dog';
    });
    model.save(function(err) {
      assert.ifError(err);
      coll.get(model.id, function(err, saved) {
        assert.ifError(err);
        assert.strictEqual(saved.properties.job, 'dog', 'property from hook was saved');
        saved.destroy(function(err) {
          assert.ifError(err);
          done();
        });
      });
    });
  });
});