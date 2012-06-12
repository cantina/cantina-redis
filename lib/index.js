/**
 * Cantina Redis
 * -------------
 *
 * Create redis-backed models and interact with redis server
 *
 * Example usage
 * =============
 *
 *     var cantina = require('cantina')
 *      , RedisCollection = require('../').RedisCollection
 *      , RedisModel = require('../').RedisModel;
 *
 *     var app = cantina.createApp();
 *     app.use(require('../').plugin);
 *     app.start(function() {
 *       var schema = {
 *         type: {
 *           type: 'string',
 *           index: true
 *         },
 *         timestamp: {
 *           type: 'object',
 *           default: new Date()
 *         }
 *       };
 *       var fruit = new RedisCollection({namespace: 'fruit', schema: schema, client: app.redis});
 *       fruit.create({type: 'apple', color: 'red'}, function(err, apple) {
 *         console.log(apple.id, 'id');
 *         // tMqaP28z
 *         console.log(apple.validate(), 'validate()');
 *         // {valid: true, errors: []}
 *         fruit.find({type: 'apple'}, {sort: 'timestamp', desc: true, limit: 5}, function(err, apples) {
 *           console.log(apples[0].properties, 'model found');
 *           // We found a fruit by type
 *         });
 *       });
 *     });
 *
 * @module cantina
 * @submodule model
 * @exports {Object} Collection of submodules
 */

// Modules dependencies.
var cantina = require('cantina');

// Export sub-modules.
cantina.utils.lazy(exports, __dirname, {
  RedisModel: './model',
  RedisCollection: './collection',
  plugin: './plugin',
  prefixId: './prefix-id'
});