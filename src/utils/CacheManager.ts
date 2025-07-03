import { CachedItem } from "../types";

export interface CacheConfig {
  defaultTtlMs?: number;
  maxSize?: number;
  cleanupIntervalMs?: number;
  enableMetrics?: boolean;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

export class CacheManager {
  private cache: Map<string, CachedItem<any>> = new Map();
  private config: Required<CacheConfig>;
  private metrics: CacheMetrics;
  private cleanupTimer?: NodeJS.Timeout;
  private accessOrder: string[] = []; // For LRU eviction

  constructor(config: CacheConfig = {}) {
    this.config = {
      defaultTtlMs: config.defaultTtlMs ?? 60000,
      maxSize: config.maxSize ?? 1000,
      cleanupIntervalMs: config.cleanupIntervalMs ?? 300000, // 5 minutes
      enableMetrics: config.enableMetrics ?? true,
    };

    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      hitRate: 0,
    };

    this.startPeriodicCleanup();
  }

  async getCachedResource<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    const effectiveTtl = ttlMs ?? this.config.defaultTtlMs;
    const cachedItem = this.cache.get(key);

    // Check if item exists and is not expired
    if (cachedItem && this.isItemValid(cachedItem, effectiveTtl)) {
      this.recordHit(key);
      return cachedItem.data;
    }

    // Cache miss - fetch new data
    this.recordMiss();

    try {
      const data = await fetchFn();
      this.set(key, data, effectiveTtl);
      return data;
    } catch (error) {
      // Don't cache errors, but remove stale entry if it exists
      if (cachedItem) {
        this.cache.delete(key);
        this.updateAccessOrder(key, true);
      }
      throw error;
    }
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    const effectiveTtl = ttlMs ?? this.config.defaultTtlMs;

    // Check if we need to evict items due to size limit
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: effectiveTtl,
      accessCount: 1,
      lastAccessed: Date.now(),
    });

    this.updateAccessOrder(key);
    this.updateMetrics();
  }

  get<T>(key: string): T | null {
    const cachedItem = this.cache.get(key);

    if (!cachedItem) {
      this.recordMiss();
      return null;
    }

    if (
      !this.isItemValid(cachedItem, cachedItem.ttl ?? this.config.defaultTtlMs)
    ) {
      this.cache.delete(key);
      this.updateAccessOrder(key, true);
      this.recordMiss();
      return null;
    }

    this.recordHit(key);
    return cachedItem.data;
  }

  has(key: string): boolean {
    const cachedItem = this.cache.get(key);
    if (!cachedItem) return false;

    if (
      !this.isItemValid(cachedItem, cachedItem.ttl ?? this.config.defaultTtlMs)
    ) {
      this.cache.delete(key);
      this.updateAccessOrder(key, true);
      return false;
    }

    return true;
  }

  invalidateCache(key: string): boolean {
    const existed = this.cache.delete(key);
    if (existed) {
      this.updateAccessOrder(key, true);
      this.updateMetrics();
    }
    return existed;
  }

  invalidatePattern(pattern: string | RegExp): number {
    const regex =
      typeof pattern === "string"
        ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        : pattern;

    let removedCount = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        this.updateAccessOrder(key, true);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.updateMetrics();
    }

    return removedCount;
  }

  clearCache(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.metrics.size = 0;
    this.metrics.evictions = 0;
  }

  cleanup(): number {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, item] of this.cache.entries()) {
      if (!this.isItemValid(item, item.ttl ?? this.config.defaultTtlMs)) {
        this.cache.delete(key);
        this.updateAccessOrder(key, true);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.updateMetrics();
    }

    return removedCount;
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  getCacheKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  getMetrics(): CacheMetrics {
    this.updateHitRate();
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: this.cache.size,
      hitRate: 0,
    };
  }

  getCacheInfo(): Record<string, any> {
    const items = Array.from(this.cache.entries()).map(([key, item]) => ({
      key,
      size: this.estimateSize(item.data),
      age: Date.now() - item.timestamp,
      ttl: item.ttl ?? this.config.defaultTtlMs,
      accessCount: item.accessCount ?? 0,
      lastAccessed: item.lastAccessed ?? item.timestamp,
      isExpired: !this.isItemValid(item, item.ttl ?? this.config.defaultTtlMs),
    }));

    return {
      config: this.config,
      metrics: this.getMetrics(),
      items: items.sort((a, b) => b.lastAccessed - a.lastAccessed),
      totalSize: items.reduce((sum, item) => sum + item.size, 0),
    };
  }

  private isItemValid(item: CachedItem<any>, ttl: number): boolean {
    return Date.now() - item.timestamp < ttl;
  }

  private recordHit(key: string): void {
    if (this.config.enableMetrics) {
      this.metrics.hits++;
      const item = this.cache.get(key);
      if (item) {
        item.accessCount = (item.accessCount ?? 0) + 1;
        item.lastAccessed = Date.now();
      }
    }
    this.updateAccessOrder(key);
  }

  private recordMiss(): void {
    if (this.config.enableMetrics) {
      this.metrics.misses++;
    }
  }

  private updateAccessOrder(key: string, remove = false): void {
    // Remove key from current position
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }

    // Add to end if not removing
    if (!remove) {
      this.accessOrder.push(key);
    }
  }

  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    const keyToEvict = this.accessOrder.shift();
    if (keyToEvict && this.cache.has(keyToEvict)) {
      this.cache.delete(keyToEvict);
      this.metrics.evictions++;
    }
  }

  private updateMetrics(): void {
    if (this.config.enableMetrics) {
      this.metrics.size = this.cache.size;
      this.updateHitRate();
    }
  }

  private updateHitRate(): void {
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = total > 0 ? this.metrics.hits / total : 0;
  }

  private estimateSize(obj: any): number {
    // Rough estimation of object size in bytes
    try {
      return JSON.stringify(obj).length * 2; // Rough UTF-16 estimation
    } catch {
      return 1000; // Fallback estimate
    }
  }

  private startPeriodicCleanup(): void {
    if (this.config.cleanupIntervalMs > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, this.config.cleanupIntervalMs);
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.clearCache();
  }
}

// Enhanced CachedItem type
export interface EnhancedCachedItem<T> extends CachedItem<T> {
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}
