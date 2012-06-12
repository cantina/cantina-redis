/**
 * Cantina Redis Plugin
 * --------------------
 *
 * Cantina plugin for interacting with redis.
 *
 * @module cantina
 * @submodule redis
 * @exports {Object} A cantina plugin which attaches redis client on `app.redis`
 * @requires redis, cantina, pkginfo, prefixId
 */
var redis = require('redis')
  , cantina = require('cantina')
  ;

// Expose this service's package info.
require('pkginfo')(module);

/**
 * Example
 * =======
 *
 *     app.use('redis', {host: 'localhost', port: 6379});
 *     // `app.redis` is now available
 *
 * `app.redis` will contain:
 *
 * - `app.redis.RedisModel` {Function} Constructor for a redis-backed model.
 * - `app.redis.RedisCollection` {Function} Constructor for a redis-backed collection.
 * - `app.redis.prefixId` {Function} Function for naming keys in redis.
 *
 * @class redis
 */

/**
 * Attaches the plugin to `app`. This is called internally when you do `app#use`.
 *
 * @method attach
 * @param [options] {Object} Plugin options. Supported properties:
 *
 *   - **host** {String} Hostname of redis server
 *   - **port** {Number} Port of the redis server
 *   - Additional options will be passed to redis#createClient()
 */
exports.attach = function(options) {
  this.redis = redis.createClient(options.port, options.host, options);
  this.redis.prefixId = require('./prefix-id');
  this.redis.RedisModel = require('./model').RedisModel;
  this.redis.RedisCollection = require('./collection').RedisCollection;
};

/**
 * Connects to the redis server. This is called internally when you do `app#use`.
 *
 * @method init
 * @param callback {Function} Callback to invoke once initialization is complete.
 */
exports.init = function(callback) {
  this.redis.on('connect', callback);
};