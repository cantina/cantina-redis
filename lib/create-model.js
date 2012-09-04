var cantinaModel = require('cantina-model')
  , RedisModel = require('./model')

// Expose createModel with redis specifics added on.
module.exports = function createModel (BaseClass, options) {
  if (arguments.length < 2) {
    options = BaseClass;
    BaseClass = RedisModel;
  }

  var Model = cantinaModel.createModel(BaseClass, options);

  // If options.client is passed, expose it as a static class property.
  if (options.client) {
    Model.client = options.client;
  }

  return Model;
};