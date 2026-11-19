import { HttpException, HttpStatus } from '@nestjs/common';

/** In-memory cap on failed attempts per key (login, activation), against guessing. */
export class AttemptLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
  ) {}

  assertAllowed(key: string) {
    if (this.recent(key).length >= this.maxFailures) {
      throw new HttpException(
        'Trop de tentatives. Réessayez dans quelques minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(key: string) {
    const recent = this.recent(key);
    recent.push(Date.now());
    this.failures.set(key, recent);
  }

  reset(key: string) {
    this.failures.delete(key);
  }

  private recent(key: string) {
    const since = Date.now() - this.windowMs;
    return (this.failures.get(key) ?? []).filter((at) => at > since);
  }
}
