// Todo: Implement a caching mechanism for Azure API calls to reduce latency and avoid hitting rate limits.

export class CacheManager<T> {
  private cache: Map<string, { data: T; timestamp: number }>;
  private readonly maxSize: number;
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(maxSize: number = 1000, cleanupIntervalMs: number = 300000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
  }

  async get(key: string, fetchFn: () => Promise<T>, ttlMs: number): Promise<T> {
    const cachedItem = this.cache.get(key);
    if (cachedItem && Date.now() - cachedItem.timestamp < ttlMs) {
      return cachedItem.data;
    }

    const data = await fetchFn();
    this.set(key, data);
    return data;
  }

  private set(key: string, data: T): void {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = Array.from(this.cache.keys())[0];
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > 600000) {
        // 10 minutes TTL
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  dispose(): void {
    clearInterval(this.cleanupInterval);
    this.clear();
  }
}
