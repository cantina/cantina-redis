/**
 * Redis
 *
 * Create redis-backed models or interact with redis server
 *
 * @module cantina
 * @submodule redis
 */

// Modules dependencies.
var cantina = require('cantina');

// Export sub-modules.
cantina.utils.lazy(exports, __dirname, {
  RedisModel: './model',
  RedisCollection: './collection',
  plugin: './plugin'
});