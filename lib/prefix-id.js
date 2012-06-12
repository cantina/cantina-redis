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