import { createHash, randomInt } from 'crypto';

// No 0/O, 1/I/L: codes are read aloud and typed by hand.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GROUPS = 3;
const GROUP_LENGTH = 4;

/** A new code such as "KPT-7HQ2-M9XA-4TWR". */
export function generateActivationCode(): string {
  const groups = Array.from({ length: GROUPS }, () =>
    Array.from(
      { length: GROUP_LENGTH },
      () => ALPHABET[randomInt(ALPHABET.length)],
    ).join(''),
  );
  return `KPT-${groups.join('-')}`;
}

/** Same code whatever the case, spaces or dashes typed; '' when it cannot be a code. */
export function normalizeActivationCode(input: string): string {
  const compact = input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^KPT/, '');
  return compact.length === GROUPS * GROUP_LENGTH ? compact : '';
}

/** Only this hash is stored: a database leak does not reveal usable codes. */
export function hashActivationCode(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex');
}
