/**
 * Tests for RedisViews.
 */
var assert = require('assert'),
    redis = require('haredis'),
    createModel = require('../lib/create-model'),
    destroyAll = require('../lib/destroy-all'),
    RedisCollection = require('../lib/collection'),
    RedisView = require('../lib/view'),
    client = redis.createClient();

describe('views', function() {
  var Food = createModel({
    schema: {
      name: 'food',
      properties: {
        group: {
          type: 'string'
        },
        name: {
          type: 'string'
        },
        calories: {
          type: 'number'
        }
      }
    }
  });
  var Drink = createModel({
    schema: {
      name: 'drink',
      properties: {
        group: {
          type: 'string',
          required: true
        },
        name: {
          type: 'string',
          required: true
        },
        calories: {
          type: 'number'
        },
        diet: {
          type: 'boolean',
          default: false
        }
      }
    }
  });

  describe('view with no sort', function() {
    var view, models;

    before(function() {
      view = new RedisView({
        client: client,
        name: 'fruit',
        models: [Food],
        filter: function(model) {
          return model.properties.group && model.properties.group === 'fruit';
        }
      });
      models = [
        new Food({group: 'fruit',   name: 'apple'}),
        new Food({group: 'dessert', name: 'cake'}),
        new Food({group: 'fruit',   name: 'orange'}),
        new Food({group: 'fruit',   name: 'pear'}),
        new Food({group: 'meat',    name: 'chicken'})
      ];
    });

    afterEach(function() {
      view.removeAllListeners();
    });

    after(function(done) {
      destroyAll(view, models, done);
    });

    it('should list() the correct models', function(done) {
      var count = 0;

      view.on('error', function(err, model) {
        assert.ifError(err);
      });

      view.on('model:added', function(model) {
        if (++count === 3) {
          view.list(function(err, models) {
            var fruit = true;
            assert.ifError(err);
            assert.equal(models.length, 3, 'Wrong number of models listed');
            models.forEach(function(model) {
              if (model.properties.group !== 'fruit') {
                fruit = false;
              }
            });
            assert.ok(fruit);
            done();
          });
        }
      });

      models.forEach(function(model) {
        model.save();
      });
    });

    it('should reflect model updates that miss the filter', function(done) {
      var apple = models[0];

      view.on('error', function(err, model) {
        assert.ifError(err);
      });

      view.on('model:removed', function(model) {
        assert.equal(apple.properties.name, model.properties.name);
        view.list(function(err, models) {
          assert.ifError(err);
          assert.equal(models.length, 2, 'Wrong number of models listed');
          done();
        });
      });

      apple.properties.group = 'candy';
      apple.save();
    });

    it('should reflect destroyed models', function(done) {
      var orange = models[2];

      view.on('error', function(err, model) {
        assert.ifError(err);
      });

      view.on('model:removed', function(model) {
        assert.equal(orange.properties.name, model.properties.name);
        view.list(function(err, models) {
          assert.ifError(err);
          assert.equal(models.length, 1, 'Wrong number of models listed');
          done();
        });
      });

      orange.destroy();
    });
  });

  describe('view sorted by property value', function() {
    var view, models;

    before(function() {
      view = new RedisView({
        client: client,
        name: 'fruitByCalories',
        models: [Food],
        sort: 'calories',
        dir: 'DESC',
        filter: function(model) {
          return model.properties.group && model.properties.group === 'fruit';
        }
      });
      models = [
        new Food({group: 'fruit',   name: 'apple',    calories: 90}),
        new Food({group: 'dessert', name: 'cake',     calories: 500}),
        new Food({group: 'fruit',   name: 'orange',   calories: 130}),
        new Food({group: 'fruit',   name: 'pear',     calories: 72}),
        new Food({group: 'meat',    name: 'chicken',  calories: 270})
      ];
    });

    afterEach(function() {
      view.removeAllListeners();
    });

    after(function(done) {
      destroyAll(view, models, done);
    });

    it('should list() the models in correct default order', function(done) {
      var count = 0;

      view.on('error', function(err, model) {
        assert.ifError(err);
      });

      view.on('model:added', function(model) {
        if (++count === 3) {
          view.list(function(err, models) {
            assert.ifError(err);
            assert.equal(models[0].properties.name, 'orange', 'Orange was not the first result');
            assert.equal(models[1].properties.name, 'apple', 'Apple was not the second result');
            assert.equal(models[2].properties.name, 'pear', 'Pear was not the third result');
            done();
          });
        }
      });

      models.forEach(function(model) {
        model.save();
      });
    });

    it('should list() the models in a custom direction', function(done) {
      view.on('error', function(err, model) {
        assert.ifError(err);
      });

      view.list(10, 0, 'ASC', function(err, models) {
        assert.ifError(err);
        assert.equal(models[0].properties.name, 'pear', 'Pear was not the first result');
        assert.equal(models[1].properties.name, 'apple', 'Apple was not the second result');
        assert.equal(models[2].properties.name, 'orange', 'Orange was not the third result');
        done();
      });
    });

    it('should reflect changes to model sort property', function(done) {
      var pear = models[3];

      view.on('error', function(err, model) {
        assert.ifError(err);
      });

      view.on('model:updated', function(model) {
        assert.equal(model.properties.name, pear.properties.name);
        view.list(10, 0, 'ASC', function(err, models) {
          assert.ifError(err);
          assert.equal(models[2].properties.name, 'pear', 'Pear was not the third result');
          done();
        });
      });

      pear.properties.calories = 200;
      pear.save();
    });
  });

  describe('Cached view', function() {
    var view, models;

    before(function() {
      view = new RedisView({
        client: client,
        name: 'fruitByCaloriesCached',
        models: [Food],
        sort: 'calories',
        dir: 'DESC',
        cache: true,
        filter: function(model) {
          return model.properties.group && model.properties.group === 'fruit';
        }
      });
      models = [
        new Food({group: 'fruit',   name: 'apple',    calories: 90}),
        new Food({group: 'dessert', name: 'cake',     calories: 500}),
        new Food({group: 'fruit',   name: 'orange',   calories: 130}),
        new Food({group: 'fruit',   name: 'pear',     calories: 72}),
        new Food({group: 'meat',    name: 'chicken',  calories: 270})
      ];
    });

    afterEach(function() {
      view.removeAllListeners();
    });

    after(function(done) {
      destroyAll(view, models, done);
    });

    it('should list() the models in correct default order', function(done) {
      var count = 0;

      view.on('error', function(err, model) {
        assert.ifError(err);
      });

      view.on('model:added', function(model) {
        if (++count === 3) {
          view.list(function(err, models) {
            assert.ifError(err);
            assert.equal(models[0].properties.name, 'orange', 'Orange was not the first result');
            assert.equal(models[1].properties.name, 'apple', 'Apple was not the second result');
            assert.equal(models[2].properties.name, 'pear', 'Pear was not the third result');
            done();
          });
        }
      });

      models.forEach(function(model) {
        model.save();
      });
    });

    it('should list() the models in a custom direction', function(done) {
      view.on('error', function(err, model) {
        assert.ifError(err);
      });

      view.list(10, 0, 'ASC', function(err, models) {
        assert.ifError(err);
        assert.equal(models[0].properties.name, 'pear', 'Pear was not the first result');
        assert.equal(models[1].properties.name, 'apple', 'Apple was not the second result');
        assert.equal(models[2].properties.name, 'orange', 'Orange was not the third result');
        done();
      });
    });
  });

  describe('view with multiple collections', function() {
    // TODO: Implement this test.
  });

  describe('repopulate', function() {
    var view, models;

    before(function(done) {
      var count = 0;
      models = [
        new Food({group: 'fruit',   name: 'apple',    calories: 90}),
        new Food({group: 'dessert', name: 'cake',     calories: 500}),
        new Food({group: 'fruit',   name: 'orange',   calories: 130}),
        new Food({group: 'fruit',   name: 'pear',     calories: 72}),
        new Food({group: 'meat',    name: 'chicken',  calories: 270})
      ];
      models.forEach(function(model) {
        model.save(function(err) {
          assert.ifError(err);
          if (++count >= 5) {
            done();
          }
        });
      });
    });

    after(function(done) {
      destroyAll(view, models, done);
    });

    it('should repopulate a view', function(done) {
      view = new RedisView({
        client: client,
        name: 'fruitByCaloriesPopulate',
        models: [Food],
        sort: 'calories',
        dir: 'DESC',
        filter: function(model) {
          return model.properties.group && model.properties.group === 'fruit';
        }
      });
      view.repopulate(function(err) {
        assert.ifError(err);
        view.list(function(err, models) {
          assert.ifError(err);
          assert.equal(models.length, 3, 'Wrong number of models in the view');
          done();
        });
      });
    });
  });

});
