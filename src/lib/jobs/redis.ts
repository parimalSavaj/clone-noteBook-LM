import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Shared Redis connection for BullMQ.
 * Lazy initialization to avoid connection errors during build.
 */
let _redis: IORedis | null = null;

export function getRedis(): IORedis {
  if (!_redis) {
    _redis = new IORedis(redisUrl, {
      maxRetriesPerRequest: null, // Required by BullMQ
    });
  }
  return _redis;
}

// For backward compat — accessed lazily at runtime only
export const redis = new Proxy({} as IORedis, {
  get(_target, prop) {
    return (getRedis() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
