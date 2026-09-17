import { isValidPin, isValidUsername } from '@/lib/core.js';
import { matchesSecret } from '@/lib/auth.js';
import { countUsers, createUser } from '@/lib/repo.js';
import { bad, body, handler, ok } from '@/lib/routes.js';

/**
 * Creates the very first account, and nothing else.
 *
 * Two locks, and the second is the one that matters: the bootstrap key must
 * match, *and* the users table must be empty. Once one account exists this
 * endpoint is dead whatever key is presented, so a leaked key buys an attacker
 * nothing on a running app — which is what makes it safe to leave the variable
 * set and forget about it.
 */
export const GET = handler(async () => ok({ needed: (await countUsers()) === 0 }));

export const POST = handler(async (request) => {
  if ((await countUsers()) > 0) {
    return bad('There is already an account. Sign in instead.', 409);
  }

  const { key, username, displayName, pin } = await body(request);

  if (!(await matchesSecret(key, process.env.PALETTE_BOOTSTRAP_KEY))) {
    return bad('That setup key is not right.', 403);
  }
  if (!isValidUsername(username)) {
    return bad('Usernames are 2-30 characters, lowercase letters, numbers, - and _.');
  }
  if (!isValidPin(pin)) {
    return bad('PINs are digits only, at least six of them.');
  }

  const user = await createUser({
    username,
    displayName: (displayName || username).trim(),
    pin,
  });

  return ok({ user });
});
