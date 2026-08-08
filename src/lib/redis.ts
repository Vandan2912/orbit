import Redis from "ioredis";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  }
  return client;
}

const CACHE_TTL_SECONDS = 60 * 60;

export async function getCachedAnalysis(cacheKey: string): Promise<string | null> {
  return getRedis().get(`analysis:${cacheKey}`);
}

export async function setCachedAnalysis(cacheKey: string, value: string): Promise<void> {
  await getRedis().set(`analysis:${cacheKey}`, value, "EX", CACHE_TTL_SECONDS);
}

export async function clearAnalysisCache(repoFilter?: string): Promise<number> {
  const redis = getRedis();
  const keys = await redis.keys(repoFilter ? `analysis:*${repoFilter}*` : "analysis:*");
  if (keys.length === 0) return 0;
  await redis.del(...keys);
  return keys.length;
}
