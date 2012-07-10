/**
 * Tests for RedisViews.
 */
var assert = require('assert'),
    utils = require('cantina-utils'),
    redis = require('haredis'),
    lib = require('../'),
    RedisCollection = lib.RedisCollection,
    RedisView = lib.RedisView,
    client = redis.createClient();

describe('views', function() {
  var Food = lib.createModel({
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
  var Drink = lib.createModel({
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
  var pantry = new RedisCollection({
    client: client,
    model: Food
  });
  var vendingMachine = new RedisCollection({
    client: client,
    model: Drink
  });

  describe('view with no sort', function() {
    var view, models;

    before(function() {
      view = new RedisView({
        client: client,
        name: 'fruit',
        collections: [pantry],
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

    after(function(done) {
      lib.destroyAll(view, models, done);
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
  });

  describe('view sorted by property value', function() {
    var view, models;

    before(function() {
      view = new RedisView({
        client: client,
        name: 'fruitByCalories',
        collections: [pantry],
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

    after(function(done) {
      lib.destroyAll(view, models, done);
    });

    it('should list() the models in correct order', function(done) {
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

            view.list(10, 0, 'ASC', function(err, models) {
              assert.ifError(err);
              assert.equal(models[0].properties.name, 'pear', 'Pear was not the first result');
              assert.equal(models[1].properties.name, 'apple', 'Apple was not the second result');
              assert.equal(models[2].properties.name, 'orange', 'Orange was not the third result');
              done();
            });
          });
        }
      });

      models.forEach(function(model) {
        model.save();
      });
    });
  });

  describe('view with multiple collections', function() {

  });

});
