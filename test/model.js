/**
 * test/model.js - Tests for Cantina Redis.
 */
var utils = require('cantina-utils')
  , assert = require('assert')
  , redis = require('haredis')
  , RedisModel = require('../').RedisModel
  , RedisCollection = require('../').RedisCollection
  ;

describe('model/collection', function() {
  var coll, cleanup = [];
  before(function() {
    var schema = {
      job: {
        type: 'string',
        index: true
      }
    };
    coll = new RedisCollection({client: redis.createClient(), schema: schema});
  });

  after(function() {
    var model;
    while (model = cleanup.pop()) {
      model.destroy();
    }
  });

  var myId;
  it('can create a model', function(done) {
    var model = new RedisModel({name: 'carlos'}, coll);
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
    var model = new RedisModel({name: 'buster'}, coll);
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

  it('can query an index', function(done) {
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
    utils.async.parallel(tasks, function(err, results) {
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
    utils.async.parallel(tasks, function(err, results) {
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

  describe('separate collection', function() {
    var fruit;
    before(function() {
      var schema = {
        color: {
          type: 'number',
          index: true
        },
        type: {
          type: 'string'
        }
      };
      fruit = new RedisCollection({namespace: 'fruit', schema: schema, client: redis.createClient()});
    });

    it('can create a new collection', function(done) {
      fruit.find({}, function(err, models) {
        assert.ifError(err);
        assert.strictEqual(models.length, 0, 'new collection has no models');
        done();
      });
    });

    it('can add a model to new collection', function(done) {
      fruit.create({type: 'banana', color: 0xE3CF57}, function(err, model) {
        assert.ifError(err);
        assert.strictEqual(model.properties.color, 0xE3CF57);
        cleanup.push(model);
        done();
      });
    });

    it('can add a second model to new collection', function(done) {
      fruit.create({type: 'orange', color: 0xFF7D40}, function(err, model) {
        assert.ifError(err);
        assert.strictEqual(model.properties.color, 0xFF7D40);
        cleanup.push(model);
        done();
      });
    });

    it('can query new collection', function(done) {
      fruit.find({color: 0xE3CF57}, function(err, models) {
        assert.ifError(err);
        assert.strictEqual(models.length, 1);
        assert.strictEqual(models[0].properties.type, 'banana');
        done();
      });
    });
  });
});