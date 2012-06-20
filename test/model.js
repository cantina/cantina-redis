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
  var coll, cleanup = [], MyModel;
  function assertModel(model) {
    assert.ok(model, 'model is ok');
    cleanup.push(model);
  }
  function assertValid(err) {
    if (utils.isArray(err)) {
      console.error(err);
      assert.fail('validation errors');
    }
    else {
      assert.ifError(err);
    }
  }
  before(function() {
    MyModel = function MyModel(attrs, options) {
      MyModel.super.call(this, attrs, options);
    }
    utils.inherits(MyModel, RedisModel);
    MyModel.schema = {
      properties: {
        job: {
          type: 'string',
          index: true
        },
        color: {
          type: 'string',
          index: true
        },
        timestamp: {
          type: 'number'
        }
      }
    };
    coll = new RedisCollection({client: redis.createClient(), model: MyModel});
  });

  after(function() {
    var model;
    while (model = cleanup.pop()) {
      model.destroy();
    }
    assert.strictEqual(cleanup.length, 0, 'no models left over');
  });

  var myId;
  it('can create a model', function(done) {
    var model = new MyModel({name: 'carlos'}, coll);
    model.save(function(err) {
      assertValid(err);
      myId = model.id;
      assert.ok(myId);
      done(err);
    });
  });

  var myModel;
  it('can get the model', function(done) {
    coll.get(myId, function(err, model) {
      assertValid(err);
      assert.ok(model, 'got a model back');
      assert.strictEqual(model.id, myId);
      assert.strictEqual(model.properties.name, 'carlos');
      done();
    });
  });

  it('can update the model', function(done) {
    coll.update(myId, {name: 'scooby'}, function(err, model) {
      assertValid(err);
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
    var model = new MyModel({name: 'buster'}, coll);
    assertModel(model);
    model.on('save:before', function(model) {
      this.properties.job = 'dog';
    });
    model.save(function(err) {
      assertValid(err);
      coll.get(model.id, function(err, saved) {
        assert.ifError(err);
        assert.strictEqual(saved.properties.job, 'dog', 'property from hook was saved');
        done();
      });
    });
  });

  it('can query an index', function(done) {
    coll.create({name: 'egon', job: 'ghostbuster'}, function(err, model) {
      assertValid(err);
      assertModel(model);
      coll.create({name: 'kobe', job: 'baller'}, function(err, model) {
        assertValid(err);
        assertModel(model);
        coll.find({job: 'ghostbuster'}, function(err, models) {
          assert.ifError(err);
          assert.strictEqual(models.length, 1);
          assert.strictEqual(models[0].properties.name, 'egon');
          done();
        });
      });
    });
  });

  it('can findOne with an indexed query', function(done) {
    coll.create({name: 'egon', job: 'ghostbuster'}, function(err, model) {
      assertValid(err);
      assertModel(model);
      coll.create({name: 'kobe', job: 'baller'}, function(err, model) {
        assertValid(err);
        assertModel(model);
        coll.findOne({job: 'ghostbuster'}, function(err, model) {
          assert.ifError(err);
          assert.strictEqual(model.properties.name, 'egon');
          done();
        });
      });
    });
  });

  it('can sort and limit', function(done) {
    var tasks = [], max = 0;
    for (var i = 0; i < 100; i++) {
      tasks.push(function(cb) {
        var rand = Math.random();
        max = Math.max(rand, max);
        coll.create({timestamp: rand}, function(err, model) {
          assertModel(model);
          cb(err, model);
        });
      })
    }
    utils.async.parallel(tasks, function(err, results) {
      assertValid(err);
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
    coll.schema.timestamp = {
      type: 'number'
    };
    for (var i = 0; i < 10; i++) {
      tasks.push(function(cb) {
        var rand = Math.random();
        coll.create({color: 'red', timestamp: rand}, function(err, model) {
          assertModel(model);
          cb(err, model);
        });
      })
    }
    for (var i = 0; i < 10; i++) {
      tasks.push(function(cb) {
        var rand = Math.random();
        blue_min = Math.min(rand, blue_min);
        coll.create({color: 'blue', timestamp: rand}, function(err, model) {
          assertModel(model);
          cb(err, model);
        });
      })
    }
    utils.async.parallel(tasks, function(err, results) {
      assertValid(err);
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
      assertValid(err);
      assertModel(model);
      assert.deepEqual(model.toJSON(), obj);
      done();
    });
  });

  describe('separate collection', function() {
    var fruit;
    before(function() {
      function Fruit(attrs, options) {
        Fruit.super.call(this, attrs, options);
      }
      utils.inherits(Fruit, RedisModel);
      Fruit.schema = {
        name: 'fruit',
        properties: {
          color: {
            type: 'number',
            index: true
          },
          type: {
            type: 'string'
          }
        }
      };
      fruit = new RedisCollection({model: Fruit, client: redis.createClient()});
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
        assertValid(err);
        assert.strictEqual(model.properties.color, 0xE3CF57);
        assertModel(model);
        done();
      });
    });

    it('can add a second model to new collection', function(done) {
      fruit.create({type: 'orange', color: 0xFF7D40}, function(err, model) {
        assertValid(err);
        assert.strictEqual(model.properties.color, 0xFF7D40);
        assertModel(model);
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