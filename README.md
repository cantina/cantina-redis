cantina-redis
=============

Create redis-backed models or interact with a redis server.

Provides
--------
- **app.redis** - Redis client (haredis).
- **app.redis.module** - The required `haredis` module.
- **app.redisKey** - Returns a prefixed key suitable for redis queries.

Configuration
-------------
- **redis** - Options for creating the haredis client.

**Defaults**
```js
{
  redis: {
    nodes: ['127.0.0.1:6379'],
    prefix: 'cantina'
  }
}
```

- - -

### Developed by [Terra Eclipse](http://www.terraeclipse.com)
Terra Eclipse, Inc. is a nationally recognized political technology and
strategy firm located in Santa Cruz, CA and Washington, D.C.
