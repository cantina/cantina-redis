/**
 * test/plugin.js - Tests for Cantina Redis.
 */

var assert = require('assert')
  , cantina = require('cantina')
  , redis = require('redis')
  , RedisModel = require('../').RedisModel
  , RedisCollection = require('../').RedisCollection
  , async = require('async')
  ;

describe('Cantina Redis', function() {
  var coll, cleanup = [];
  before(function() {
    coll = new RedisCollection().init({client: redis.createClient()});
  });

  after(function() {
    var model;
    while (model = cleanup.pop()) {
      model.destroy();
    }
  });

  var myId;
  it('can create a model', function(done) {
    var model = new RedisModel().init({name: 'carlos'}, coll);
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
    var model = new RedisModel().init({name: 'buster'}, coll);
    cleanup.push(model);
    model.on('save:before', function(model) {
      this.properties.job = 'dog';
    });
    model.save(function(err) {
      assert.ifError(err);
      coll.get(model.id, function(err, saved) {
        assert.ifError(err);
        assert.strictEqual(saved.properties.job, 'dog', 'property from hook was saved');
        done();
      });
    });
  });

  it('can index a field', function(done) {
    coll.indexes.push('job');
    coll.create({name: 'egon', job: 'ghostbuster'}, function(err, model) {
      assert.ifError(err);
      cleanup.push(model);
      coll.create({name: 'kobe', job: 'baller'}, function(err, model) {
        assert.ifError(err);
        cleanup.push(model);
        coll.find({job: 'ghostbuster'}, function(err, models) {
          assert.ifError(err);
          assert.strictEqual(models.length, 1);
          assert.strictEqual(models[0].properties.name, 'egon');
          done();
        });
      });
    });
  });

  it('can sort and limit', function(done) {
    var tasks = [], max = 0;
    coll.schema.timestamp = {
      type: 'number'
    };
    for (var i = 0; i < 100; i++) {
      tasks.push(function(cb) {
        var rand = Math.random();
        max = Math.max(rand, max);
        coll.create({timestamp: rand}, function(err, model) {
          cleanup.push(model);
          cb(err, model);
        });
      })
    }
    async.parallel(tasks, function(err, results) {
      assert.ifError(err);
      assert.ok(results, 'created some timestamp records');
      coll.find({}, {sort: 'timestamp', desc: true, limit: 70, skip: 1}, function(err, models) {
        assert.ifError(err);
        assert.ok(models[0].properties.timestamp < max, 'max timestamp skipped');
        assert.strictEqual(models.length, 70, 'correct limit');
        var last;
        models.forEach(function(model) {
          if (last) {
            assert.ok(model.properties.timestamp < last, 'timestamp decreasing');
          }
          last = model.properties.timestamp;
        });
        done();
      });
    });
  });

  it('can filter with sort and skip/limit', function(done) {
    var tasks = [], blue_min = 1;
    coll.indexes.push('color');
    coll.schema.timestamp = {
      type: 'number'
    };
    for (var i = 0; i < 10; i++) {
      tasks.push(function(cb) {
        var rand = Math.random();
        coll.create({color: 'red', timestamp: rand}, function(err, model) {
          cleanup.push(model);
          cb(err, model);
        });
      })
    }
    for (var i = 0; i < 10; i++) {
      tasks.push(function(cb) {
        var rand = Math.random();
        blue_min = Math.min(rand, blue_min);
        coll.create({color: 'blue', timestamp: rand}, function(err, model) {
          cleanup.push(model);
          cb(err, model);
        });
      })
    }
    async.series(tasks, function(err, results) {
      assert.ifError(err);
      assert.ok(results, 'created some records');
      coll.find({color: 'blue'}, {sort: 'timestamp', limit: 10, skip: 1}, function(err, models) {
        assert.ifError(err);
        assert.ok(models[0].properties.timestamp > blue_min, 'blue_min timestamp skipped');
        assert.strictEqual(models.length, 9, 'correct filter/limit/skip');
        var last;
        models.forEach(function(model) {
          if (last) {
            assert.ok(model.properties.timestamp > last, 'timestamp ascending');
          }
          last = model.properties.timestamp;
          assert.strictEqual(model.properties.color, 'blue', 'filtered to blue');
        });
        done();
      });
    });
  });

  it('can store a complex object', function(done) {
    var obj = {
      _id: 1234,
      history: {
        'may 14th 2012': {
          birthdays: ['erin', 'mark', new Date(), /something/],
          hours: 24
        },
        today: {
          date: new Date()
        }
      },
      patterns: [/blah/, /etc/]
    };
    coll.create(obj, function(err, model) {
      cleanup.push(model);
      assert.ifError(err);
      assert.deepEqual(model.toJSON(), obj);
      done();
    });
  });
});