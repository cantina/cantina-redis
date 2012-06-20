/**
 * Function for constructing keys to use with redis.
 *
 * @module cantina
 * @submodule redis
 * @exports {Function} prefixKey function.
 */

/**
 * @class redis
 * @method prefixKey
 * @param key {String} Key to prefix (optional).
 * @param name {String} Name of the model (defaults to name of schema).
 * @param prefix {String} Prefix (defaults to prefix of model/collection)
 * @return {String} Key to use with redis.
 */
module.exports = function prefixKey(key, name, prefix) {
  var parts = ['cantina'];
  if (arguments.length < 2) {
    name = this.schema ? this.schema.name : null;
    prefix = this.prefix;
  }
  if (prefix) {
    parts.push(prefix);
  }
  if (name) {
    parts.push(name);
  }
  if (key) {
    parts.push(key);
  }
  return parts.join(':');
};