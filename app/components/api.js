'use client';

/**
 * Every write goes through here, so the failure path is written once.
 *
 * The server's message is thrown as-is rather than replaced with something
 * generic: routes.js deliberately turns thrown errors into readable sentences
 * (repo.js's refusal to delete an item with payments against it is the clearest
 * case), and swallowing them would throw away the useful half of the failure.
 */
async function send(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // A response with no JSON at all — a proxy error page, say.
  }

  if (!response.ok) throw new Error(payload.error || `That did not work (${response.status}).`);
  return payload;
}

export const post = (url, body) => send('POST', url, body);
export const patch = (url, body) => send('PATCH', url, body);
export const del = (url) => send('DELETE', url);
