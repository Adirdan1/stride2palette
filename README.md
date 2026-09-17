# Palette

A launch board for opening a small venue — lasagna, alcohol, coffee. Everything
that has to happen before the doors open: licences, permits, the lease, the
fit-out, equipment, the first supplier order. What it costs, what it has
actually cost, and how long is left.

Next.js 15 (App Router, plain JS) on Vercel. Supabase Postgres, reached only from
the server with the service role key. More than one person can sign in.

Part of the Stride collection — see
`.claude/skills/ship-stride-app/SKILL.md`, which is binding for anything built
here.

---

## The five invariants

These are the load-bearing decisions. Everything else is negotiable; these are
not.

**1. Actual spend is derived, never stored.**
There is no `actual_agorot` column anywhere in the schema. What an item has cost
is `sum(payments.gross_agorot)` for that item, recomputed on every read. A
licence is paid as a deposit and then a balance, sometimes months apart and
sometimes partly refunded when an application is withdrawn — that is a history,
and a history late data can rewrite. A stored total would have to be migrated
backwards to stay honest, and would be wrong in the meantime.

Planned spend is the opposite and is a column, because it is not a total of
anything. It is what you expected to pay when you wrote the item down, frozen at
that moment.

**2. The VAT rate is frozen onto every payment.**
The Israeli rate has already moved once, 17% to 18%. Changing the rate in
settings decides what the *next* invoice means. It must never rewrite what last
March's did, so each payment carries the rate it was actually charged at, and an
old payment can legitimately show a different split from a new one.

**3. Undated is a real answer, not a missing value.**
An item with no due date is never overdue and never nagged about. Plenty of
things genuinely have no deadline until somebody gives you one, and inventing a
date so the software has something to sort by is how a board stops being
believed. Undated work sits in SOMEDAY until it has a date or somebody starts it.

**4. `waiting` is a status, not a flavour of `doing`.**
A permit application sitting with the municipality is not work nobody has
started. One of those means *do something*; the other means *you have done your
part*. Collapsing them would leave the board unable to answer the only question
it really exists for — what needs me today — so `waiting` gets its own status and
its own band, out of the actionable list.

**5. Money is an integer count of agorot.**
Never a float, not in the column, not in core, not in transit. `numeric` would
also be exact, but an integer is exact *and* cannot be quietly widened by a JSON
round trip on the way to the browser. Amounts are entered gross, as the invoice
reads; net and VAT are derived.

## Shape

```
app/
  page.js              the Launch Board — the one screen
  unlock/              the gate, and first-account setup
  components/          server components by default, 'use client' where needed
  api/                 one directory per endpoint
  globals.css          the design system — read before changing any styling
lib/
  core.js              every rule the app has, pure, zero imports
  repo.js              data access, and the only module that knows column names
  db.js                the Supabase client, built lazily
  auth.js              PIN hashing and cookie signing, Web Crypto only
  format.js            presentation helpers
  routes.js            the ceremony every route handler shares
test/                  Vitest over the pure modules
supabase/migrations/   schema, applied in filename order
middleware.js          the gate, on the edge
```

`lib/core.js` imports nothing. That is the collection's most load-bearing
convention: every rule the app has lives in pure functions that run without a
database, which is what makes them exhaustively testable.

## Who can get in

A `users` table and a `sessions` table, following `stride2mortgage` — not
Stride's single shared PIN, because this app has staff in it. A username and a
PIN, hashed with PBKDF2. Five wrong attempts starts a lockout that doubles from a
minute and caps at an hour, tracked on the user row so it survives a restart and
an attacker changing IP.

The session cookie carries the user id and an HMAC over both id and issue time,
so the edge middleware verifies identity with no database call. The `sessions`
row exists for revocation and last-seen, and stores the token hashed.

There are no roles. Everyone who can sign in can see and edit everything, which
is a decision rather than an omission — a venue this size has no information one
member of staff should be kept from.

## Running it

```sh
npm install
npm test                       # 81 tests, under a second
cp .env.example .env.local     # then fill in the Supabase key
npm run dev
```

Development is left open when `PALETTE_SECRET` is unset so `npm run dev` needs no
setup. Production fails closed: an unset secret seals the app rather than serving
the venue's finances to anyone with the URL.

`/api/health` is public and reports whether each variable is *present*, never
what it holds. It is the first thing to check on a deploy that will not sign in.

## Deploying

```sh
VERCEL_TOKEN=… SUPABASE_SERVICE_ROLE_KEY=… bash scripts/vercel-setup.sh
```

Creates the project, connects the repo, sets every variable, and prints the
bootstrap key. After that, **merging to `main` deploys** — do not push non-git
deployments into a linked project.

Then open `/unlock`, type the bootstrap key and make the first account. That
endpoint refuses once any account exists, so it needs no cleaning up afterwards.
