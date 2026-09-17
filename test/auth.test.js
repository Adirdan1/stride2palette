import { describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  hashPin,
  hashSessionToken,
  issueSession,
  timingSafeEqual,
  verifyPin,
  matchesSecret,
  verifySession,
} from '../lib/auth.js';

const SECRET = 'a-long-random-signing-secret-for-tests';
const USER = '6f1b1c9e-1f4a-4a3c-9c1d-2f3a4b5c6d7e';

describe('timingSafeEqual', () => {
  it('matches identical strings and rejects everything else', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'ab')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
    expect(timingSafeEqual('abc', null)).toBe(false);
    expect(timingSafeEqual(undefined, undefined)).toBe(false);
    expect(timingSafeEqual(123, 123)).toBe(false);
  });
});

describe('PINs', () => {
  it('verifies the PIN it hashed', async () => {
    const stored = await hashPin('123456');
    expect(await verifyPin('123456', stored)).toBe(true);
  });

  it('rejects the wrong PIN, including near misses', async () => {
    const stored = await hashPin('123456');
    expect(await verifyPin('123457', stored)).toBe(false);
    expect(await verifyPin('12345', stored)).toBe(false);
    expect(await verifyPin('1234567', stored)).toBe(false);
    expect(await verifyPin('', stored)).toBe(false);
  });

  it('salts, so the same PIN never produces the same hash twice', async () => {
    const a = await hashPin('123456');
    const b = await hashPin('123456');
    expect(a).not.toBe(b);
    // ...and both still verify.
    expect(await verifyPin('123456', a)).toBe(true);
    expect(await verifyPin('123456', b)).toBe(true);
  });

  it('records its own work factor so it can be raised later', async () => {
    const [scheme, iterations] = (await hashPin('123456')).split('$');
    expect(scheme).toBe('pbkdf2');
    expect(Number(iterations)).toBeGreaterThanOrEqual(100000);
  });

  it('refuses malformed stored hashes rather than throwing', async () => {
    for (const stored of ['', 'nonsense', 'pbkdf2$100000$onlythree', 'md5$1$a$b',
                          'pbkdf2$abc$c2FsdA$aGFzaA', 'pbkdf2$0$c2FsdA$aGFzaA', null, undefined]) {
      expect(await verifyPin('123456', stored)).toBe(false);
    }
  });

  it('refuses a non-string PIN', async () => {
    const stored = await hashPin('123456');
    expect(await verifyPin(123456, stored)).toBe(false);
    expect(await verifyPin(null, stored)).toBe(false);
  });
});

describe('sessions', () => {
  it('names its cookie and its lifetime', () => {
    expect(SESSION_COOKIE).toBe('palette_session');
    // A year, matching Stride. Revocation is the sessions table's job, not the
    // expiry's — see the note in lib/auth.js.
    expect(SESSION_MAX_AGE).toBe(60 * 60 * 24 * 365);
  });

  it('returns the user id the token was issued for', async () => {
    const token = await issueSession(USER, SECRET);
    expect(await verifySession(token, SECRET)).toBe(USER);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await issueSession(USER, SECRET);
    expect(await verifySession(token, 'some-other-secret')).toBe(null);
  });

  it('rejects a tampered user id', async () => {
    // The signature covers the id and the timestamp together, so one cannot be
    // swapped for another session's.
    const token = await issueSession(USER, SECRET);
    const [, issued, signature] = token.split('.');
    const forged = `${'0'.repeat(USER.length)}.${issued}.${signature}`;
    expect(await verifySession(forged, SECRET)).toBe(null);
  });

  it('rejects a tampered timestamp', async () => {
    const now = Date.now();
    const token = await issueSession(USER, SECRET, now);
    const [id, , signature] = token.split('.');
    expect(await verifySession(`${id}.${now + 1000}.${signature}`, SECRET)).toBe(null);
  });

  it('expires after the maximum age and not before', async () => {
    const issued = Date.parse('2026-09-17T12:00:00Z');
    const token = await issueSession(USER, SECRET, issued);
    const ms = SESSION_MAX_AGE * 1000;
    expect(await verifySession(token, SECRET, issued + ms - 1000)).toBe(USER);
    expect(await verifySession(token, SECRET, issued + ms)).toBe(null);
    expect(await verifySession(token, SECRET, issued + ms + 86400000)).toBe(null);
  });

  it('rejects a token issued in the future', async () => {
    const now = Date.parse('2026-09-17T12:00:00Z');
    const token = await issueSession(USER, SECRET, now + 60000);
    expect(await verifySession(token, SECRET, now)).toBe(null);
  });

  it('rejects malformed tokens rather than throwing', async () => {
    for (const token of ['', 'nonsense', 'a.b', '.', '..', 'a..c', null, undefined, 42, {}]) {
      expect(await verifySession(token, SECRET)).toBe(null);
    }
  });

  it('rejects everything when no secret is configured', async () => {
    const token = await issueSession(USER, SECRET);
    expect(await verifySession(token, '')).toBe(null);
    expect(await verifySession(token, undefined)).toBe(null);
  });

  it('survives a user id that contains dots', async () => {
    // The id is a uuid today, but the parse must not depend on that.
    const dotted = 'a.b.c';
    const token = await issueSession(dotted, SECRET);
    expect(await verifySession(token, SECRET)).toBe(dotted);
  });
});

describe('hashSessionToken', () => {
  it('is deterministic, so a token can be looked up', async () => {
    expect(await hashSessionToken('abc')).toBe(await hashSessionToken('abc'));
  });

  it('differs for different tokens', async () => {
    expect(await hashSessionToken('abc')).not.toBe(await hashSessionToken('abd'));
  });

  it('does not contain the token it hashed', async () => {
    const token = await issueSession(USER, SECRET);
    const hashed = await hashSessionToken(token);
    expect(hashed).not.toContain(USER);
    expect(hashed.length).toBeLessThan(token.length);
  });
});

describe('matchesSecret', () => {
  it('matches the configured value', async () => {
    expect(await matchesSecret('abcdef123456', 'abcdef123456')).toBe(true);
  });

  it('tolerates whitespace on either side', async () => {
    // A pasted dashboard value and a key typed on a phone both routinely pick
    // up a trailing newline or space.
    expect(await matchesSecret(' abcdef123456', 'abcdef123456')).toBe(true);
    expect(await matchesSecret('abcdef123456\n', 'abcdef123456')).toBe(true);
    expect(await matchesSecret('abcdef123456', '  abcdef123456\n')).toBe(true);
    expect(await matchesSecret('\tabcdef123456 ', '\nabcdef123456\t')).toBe(true);
  });

  it('still rejects a different secret, and whitespace inside one', async () => {
    expect(await matchesSecret('abcdef123457', 'abcdef123456')).toBe(false);
    expect(await matchesSecret('abcdef 123456', 'abcdef123456')).toBe(false);
    expect(await matchesSecret('', 'abcdef123456')).toBe(false);
    expect(await matchesSecret('abcdef123456', '')).toBe(false);
    expect(await matchesSecret(null, 'abcdef123456')).toBe(false);
    expect(await matchesSecret('abcdef123456', undefined)).toBe(false);
  });
});
