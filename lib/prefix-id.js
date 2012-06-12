/**
 * Function for naming keys in redis.
 *
 * @module cantina
 * @submodule redis
 * @exports {Function} prefixId function.
 */

/**
 * @class redis
 * @method prefixId
 * @param id {String|Number} ID to add to the key, can be null to omit the ID.
 * @param namespace {String} Namespace to group the key with.
 * @return {String} Key to use with redis.
 */
module.exports = function prefixId(id, namespace) {
  var parts = ['cantina'];
  if (namespace) {
    parts.push(namespace);
  }
  if (id) {
    parts.push(id);
  }
  return parts.join(':');
};