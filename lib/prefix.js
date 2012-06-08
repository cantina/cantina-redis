module.exports = function prefixId(id, options) {
  var prefix;
  if (options.namespace) {
    prefix += options.namespace + ':';
  }
  if (options.bucket) {
    prefix += options.bucket + ':';
  }
  return prefix + id;
};