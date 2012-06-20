var utils = require('cantina-utils')
  , RedisCollection = require('../').RedisCollection
  , RedisModel = require('../').RedisModel
  ;

function Fruit(attrs, options) {
  Fruit.super.call(this, attrs, options);
}
utils.inherits(Fruit, RedisModel);
Fruit.schema = {
  name: 'fruit',
  properties: {
    type: {
      type: 'string',
      index: true
    },
    timestamp: {
      type: 'object',
      default: function() { return new Date(); }
    }
  }
};
var fruit = new RedisCollection({model: Fruit, client: require('../').createClient()});
fruit.create({type: 'apple', color: 'red'}, function(err, apple) {
  console.log(apple.id, 'id');
  console.log(apple.validate(), 'validate()');
  fruit.find({type: 'apple'}, {sort: 'timestamp', desc: true, limit: 5}, function(err, apples) {
    console.log(apples[0].properties, 'model found');
  });
});
