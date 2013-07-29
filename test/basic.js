var assert = require('assert');

describe('redis', function() {
  var app;

  beforeEach(function(done) {
    app = require('cantina');
    app.boot(function (err) {
      assert.ifError(err);
      require('../');
      done();
    });
  });

  afterEach(function(done) {
    app.destroy(done);
  });

  it('creates a redis client', function (done) {
    app.redis.ping(function (err, result) {
      assert.ifError(err);
      assert.equal(result, 'PONG');
      done();
    });
  });

  it('app.redisKey returns a prefixed key', function () {
    assert.equal(app.redisKey('foo', 'bar', 'baz'), 'cantina:foo:bar:baz');
  });
});