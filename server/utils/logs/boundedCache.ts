/** A Map-backed cache with a hard size cap, evicting the oldest entry (insertion order) once full.
 * Plain unbounded Maps are unsafe for per-row enrichment caches: real-world traffic (and this
 * dataset in particular) can have nearly as many distinct IPs/user-agents as requests. */
export class BoundedCache<K, V> {
  private map = new Map<K, V>()

  constructor(private readonly maxSize: number) {}

  get(key: K): V | undefined {
    return this.map.get(key)
  }

  has(key: K): boolean {
    return this.map.has(key)
  }

  set(key: K, value: V): void {
    if (!this.map.has(key) && this.map.size >= this.maxSize) {
      const oldestKey = this.map.keys().next().value
      if (oldestKey !== undefined) this.map.delete(oldestKey)
    }
    this.map.set(key, value)
  }

  clear(): void {
    this.map.clear()
  }
}
