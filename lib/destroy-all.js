var async = require('async')

/**
 * DESTROY ALL THE THINGS!!!
 *
 * Given an arbitrary number of objects or arrays of objects followed by
 * a `done` callback, invoke the `destroy` methods of those objects, then call
 * `done` with any errors.
 */
module.exports = function() {
  var tasks = [],
      done = arguments[arguments.length - 1];

  for (var i = 0, len = arguments.length; i < (len - 1); i++) {
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
  async.parallel(tasks, done);
};
