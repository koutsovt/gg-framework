// ──────────────────────────────────────────────────────────────────────
// ggquant — Content-hash cache for pure layers
// Hash inputs → cache outputs. Change one parameter → only affected
// layer reruns. Speed from caching, never from doing less validation.
// ──────────────────────────────────────────────────────────────────────

/**
 * Simple content-hash cache. Keys are stringified input hashes,
 * values are cached results. In-memory only (no persistence needed
 * for sub-second incremental reruns within a session).
 */
export class ContentCache {
  private store = new Map<string, unknown>();
  private hits = 0;
  private misses = 0;

  /**
   * Get or compute a cached value.
   * @param keyParts Parts to hash into the cache key.
   * @param compute  Function to compute the value on cache miss.
   */
  getOrCompute<T>(keyParts: readonly unknown[], compute: () => T): T {
    const key = hashKey(keyParts);
    if (this.store.has(key)) {
      this.hits++;
      return this.store.get(key) as T;
    }
    this.misses++;
    const value = compute();
    this.store.set(key, value);
    return value;
  }

  /** Cache hit rate for diagnostics. */
  stats(): { hits: number; misses: number; size: number } {
    return { hits: this.hits, misses: this.misses, size: this.store.size };
  }

  /** Clear all cached entries. */
  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

/**
 * Produce a deterministic string key from input parts.
 * Uses JSON.stringify for simplicity — sufficient for the
 * numeric/string/boolean params and bar arrays we cache.
 */
function hashKey(parts: readonly unknown[]): string {
  return JSON.stringify(parts);
}
