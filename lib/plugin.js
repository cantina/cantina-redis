/**
 * Cantina: Redis Plugin
 * ------------------
 *
 * Create redis-backed models or interact with redis server
 *
 * @module cantina
 * @submodule redis
 */

var redis = require('redis')
  , cantina = require('cantina')
  ;

// Expose this service's package info.
require('pkginfo')(module);

/**
 *  Plugin
 *
 * Create redis-backed models or interact with redis server
 *
 * @class redis
 */

/**
 * Attach the plugin to an application.
 *
 * `this` will be a reference to the application.
 * You might attach models, templates, etc. onto the app here.
 * Services can bind routes via this.router (a director router).
 *
 * @method attach
 * @param [options] {Object} Plugin options.
 */
exports.attach = function(options) {
  this.redis = redis.createClient(options.port, options.host, options);
}

/**
 * Detach the service plugin from the application.
 *
 * @method detach
 */
exports.detach = function() {

}

/**
 * Respond to application initialization.
 *
 * @method init
 * @param callback {Function} Callback to invoke once initialization is complete.
 */
exports.init = function(callback) {
  this.redis.on('connect', callback);
}
