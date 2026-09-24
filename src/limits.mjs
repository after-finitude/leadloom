import { AppError } from './util.mjs';

// Fixed-window request counters kept in process memory, so rate limiting never takes the
// SQLite write lock. One server process handles all HTTP requests; counters reset on restart.
export class RateLimiter {
  constructor(maxKeys = 20000) {
    this.windows = new Map();
    this.maxKeys = maxKeys;
  }
  hit(key, max, windowMs, now) {
    if (!Number.isFinite(now)) throw new TypeError('Pass the service clock time');
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      // Re-inserting keeps the map ordered by window start, oldest first.
      this.windows.delete(key);
      if (this.windows.size >= this.maxKeys) this.evict(now);
      window = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, window);
    }
    if (window.count >= max)
      throw new AppError('rate_limited', 'Too many requests. Try again later.', 429);
    window.count++;
  }
  // Drops expired windows, then the oldest live ones, down to 90% of the cap. Memory stays
  // bounded when many addresses send requests; evicted addresses start a fresh window.
  evict(now) {
    for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
    for (const key of this.windows.keys()) {
      if (this.windows.size < this.maxKeys * 0.9) break;
      this.windows.delete(key);
    }
  }
}
