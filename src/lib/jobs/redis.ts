import IORedis from "ioredis";

// Host port 6380 matches docker-compose.yml (6379 is taken by another project).
const redisUrl = process.env.REDIS_URL || "redis://localhost:6380";

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

/**
 * Direct IORedis instance for use in worker.ts and other runtime-only code.
 * NOT a Proxy — BullMQ requires a real IORedis instance.
 */
export const redis = getRedis();
