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
 *      , cantina_redis = require('cantina-redis')
 *      , RedisCollection = cantina_redis.RedisCollection
 *      , RedisModel = cantina_redis.RedisModel;
 *
 *     var app = cantina.createApp();
 *     app.use(cantina_redis.plugin);
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
var utils = require('cantina-utils');
utils.pkginfo(module);

// Export sub-modules.
utils.lazy(module.exports, __dirname, {
  RedisModel: './model',
  RedisCollection: './collection',
  plugin: './plugin'
});

// Allow creation of redis clients from this module.
module.exports.createClient = require('haredis').createClient;