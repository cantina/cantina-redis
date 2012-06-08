module.exports = function prefixId(id, namespace) {
  return 'cantina:' + namespace + ':' + id;
};