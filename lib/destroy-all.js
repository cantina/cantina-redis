var utils = require('cantina-utils');

/**
 * DESTROY ALL THE THINGS!!!
 *
 * Given a 'done' callback and an arbitrary number of other objects or arrays
 * of objects, invoke the `destroy` methods of those objects.
 */
module.exports = function(done) {
  var tasks = [];
  for (var i = 1, len = arguments.length; i < len; i++) {
    (function(item) {
      if (item.length) {
        item.forEach(function(thing) {
          if (thing.destroy) {
            tasks.push(function(cb) {
              thing.destroy(cb);
            });
          }
        });
      }
      else {
        if (item.destroy) {
          tasks.push(function(cb) {
            item.destroy(cb);
          });
        }
      }
    })(arguments[i]);
  }
  utils.async.parallel(tasks, done);
};
