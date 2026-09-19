/**
 * Fixed-window limiter kept in process memory. Fluid Compute reuses instances, so this
 * blunts bursts from one client without spending Redis commands (the free tier budget
 * is reserved for the directory itself). It is not a global guarantee across instances.
 */
export type RateLimitOptions = { limit: number; windowMs: number; maxKeys?: number };
export type RateLimitResult = { allowed: boolean; remaining: number };

type Bucket = { count: number; resetAt: number };

export class MemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxKeys: number;

  constructor(private readonly options: RateLimitOptions) {
    this.maxKeys = options.maxKeys ?? 5000;
  }

  hit(key: string, now: number = Date.now()): RateLimitResult {
    const bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      if (this.buckets.size >= this.maxKeys) this.evict(now);
      this.buckets.set(key, { count: 1, resetAt: now + this.options.windowMs });
      return { allowed: true, remaining: this.options.limit - 1 };
    }
    if (bucket.count >= this.options.limit) return { allowed: false, remaining: 0 };
    bucket.count += 1;
    return { allowed: true, remaining: this.options.limit - bucket.count };
  }

  size(): number {
    return this.buckets.size;
  }

  private evict(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
    if (this.buckets.size >= this.maxKeys) {
      const oldest = this.buckets.keys().next().value;
      if (oldest !== undefined) this.buckets.delete(oldest);
    }
  }
}

export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
