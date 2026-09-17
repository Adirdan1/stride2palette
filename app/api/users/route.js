import { isValidPin, isValidUsername } from '@/lib/core.js';
import { createUser, listUsers } from '@/lib/repo.js';
import { bad, body, handler, ok } from '@/lib/routes.js';

/**
 * Staff.
 *
 * Anyone signed in can add anyone else. There are no roles in v1, and that is a
 * decision rather than an omission — a venue this size has no information one
 * member of staff should be kept from, and guessing at a permission model before
 * a real need appears is how you end up maintaining the wrong one.
 */
export const GET = handler(async () => ok({ users: await listUsers() }));

export const POST = handler(async (request) => {
  const { username, displayName, pin } = await body(request);

  if (!isValidUsername(username)) {
    return bad('Usernames are 2-30 characters, lowercase letters, numbers, - and _.');
  }
  if (!isValidPin(pin)) {
    return bad('PINs are digits only, at least six of them.');
  }

  try {
    return ok({ user: await createUser({ username, displayName: (displayName || username).trim(), pin }) });
  } catch (error) {
    if (String(error.message).includes('duplicate key')) {
      return bad('Somebody already has that username.', 409);
    }
    throw error;
  }
});
