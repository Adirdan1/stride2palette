---
name: ship-stride-app
description: How to build and ship an app in the Stride collection — stack, project layout, the pure-core rule, data and date conventions, the PIN gate, the design system, testing, and deploy. Use whenever starting a new app in the collection, adding a route, table, or screen to one, or deciding how something should be structured. Also use when reconciling these conventions against the original collection skill.
---

# Shipping an app in the Stride collection

> **These conventions are reconstructed, not authoritative.**
>
> They were derived by reading the working code of `Adirdan1/stride`, because the
> original collection skill was on a laptop and unreachable at the time. Everything
> below marked as a rule was observed in that codebase or confirmed directly by
> Adir. Everything uncertain is listed under **Assumptions** at the end.
>
> When the original skill becomes available, reconcile against it and rewrite this
> file. Keep conventions here rather than scattering them through the code, so that
> reconciliation stays a diff.
>
> **2026-09-15, building stride2do.** The GitHub repo `Adirdan1/stride` was *not*
> reachable from that session either — it is not in the account's accessible repo
> list, and attaching it was refused. So the source this file was reconstructed
> from could not be re-read. Two other sources were used instead, and both are
> live rather than remembered:
>
> - the **`Stride` Supabase project**, whose schema was read directly;
> - the **deployed Stride app on Vercel**, whose compiled `globals.css` is served
>   publicly even though the app itself is PIN-gated.
>
> Between them they confirmed most of this file and settled several of the
> Assumptions outright. Verdicts are recorded inline below and in the Assumptions
> section. Anything still marked *unverified* has now failed to be verified twice,
> and should be treated as the weakest material here.
>
> **2026-09-17, building stride2palette. The source was finally readable.**
> `Adirdan1/stride` and `Adirdan1/stride2do` were both attached and cloned in this
> session, so for the first time this file could be checked against the code it was
> reconstructed from rather than against artefacts of it. Every remaining
> *unverified* assumption that the source could settle is now settled — see the
> Assumptions table. The original laptop skill is still the authority if it ever
> turns up, but the gap this file was apologising for is now much smaller.
>
> One figure was simply wrong and is corrected below: Stride has **381** tests, not
> 94.

## Stack

Next.js 15 (App Router), **plain JavaScript — not TypeScript**. React 19. Supabase
Postgres. Deployed on Vercel.

Runtime dependencies are limited to `next`, `react`, `react-dom`, and
`@supabase/supabase-js`. `vitest` is the only dev dependency.

**No CSS framework and no component library.** No Tailwind, no shadcn. CSS is
written by hand against design tokens. This is deliberate: the collection is small
apps that should stay legible and load fast, and a framework is a large permanent
cost for a small one-off saving.

Node 20 or newer.

## Layout

```
app/
  page.js              the one screen that answers the app's main question
  layout.js            fonts, metadata, manifest, nav
  globals.css          the design system — read before changing any styling
  loading.js           a skeleton shaped like the real content
  components/          server components by default, 'use client' only where needed
  api/                 one directory per endpoint, route.js inside
lib/
  core.js              all pure logic
  repo.js              data access, and the only module that knows column names
  db.js                the Supabase client, built lazily
  auth.js              PIN comparison and cookie signing, Web Crypto only
  format.js            presentation helpers
test/                  Vitest suites over the pure modules
supabase/migrations/   schema, applied in filename order
scripts/               icon generation, the Scriptable widget
middleware.js          the PIN gate, runs on the edge
jsconfig.json          maps @/* to the repo root
```

## The core rule

**`lib/core.js` has no imports. Zero.**

No database, no network, no `new Date()` without an explicit `now` passed in. All
of the app's actual rules live there as pure functions.

This is the single most load-bearing convention in the collection. It is what makes
the rules exhaustively testable without a database — Stride has 381 tests across 14
files over its pure modules, covering the cases that actually bite, and they run in
under a second.

`lib/repo.js` is the boundary. It is the only place that knows table and column
names, and it translates between the database's vocabulary and core's. When the two
disagree on a word, translate at the boundary rather than bending either side.

## Data

**Derive state, never store it.** If a value can be recomputed from the rows, do
not add a column for it. Stride has no `streak` column anywhere; it recomputes on
every read. A stored counter would need migrating backwards every time late data
arrived, and would be wrong in the meantime.

**Events go in a ledger, not a counter.** Each entry carries a deterministic
idempotency key, and writes use `on conflict do nothing`. That makes reconciliation
safe to run on every single read and free after the first time — which is what
makes derived state affordable.

**Freeze values onto rows at write time.** The goal, rate, or threshold in force
when a row was written stays on that row forever. Changing a setting decides what
tomorrow demands; it must never retroactively rewrite what yesterday meant.

**Absence is neutral, not failure.** A missing row means nothing happened, not that
something went wrong. Distinguish *no data* from *data showing a miss* — only the
second one is a negative outcome. Never backfill zero rows to fill gaps.

**Settings is one row**, pinned with `id int primary key default 1 check (id = 1)`,
inserted once with `on conflict do nothing`.

**Dates are calendar dates**, formatted `YYYY-MM-DD`, treated as dates and not as
instants. Date arithmetic runs on integer day numbers, which have no DST and no
offset. **Exactly one function in the whole codebase is timezone-aware** — the one
that decides which calendar date a given instant falls on. That is the only place a
day boundary can shift, and it should be the only place anyone has to check.

**RLS is enabled on every table with no policies at all.** The server reaches the
database only with the service role key, which bypasses RLS by design. An anon or
publishable key sees nothing even if one leaks.

## Money

New with stride2palette, the first app in the collection to handle currency.

**Amounts are integers in the smallest unit** — agorot, never shekels, and never a
float. Not in the column, not in core, not in transit. `numeric` would also be
exact, but an integer is exact *and* cannot be quietly widened to a float by a JSON
round trip on the way to the browser.

**Amounts are entered gross**, exactly as they appear on the invoice. Net and the
VAT component are derived for display and never typed in, because the invoice is
the thing the person actually has in their hand. Deriving the part you can reclaim
is arithmetic; re-typing it is a second chance to be wrong.

**The VAT rate is frozen onto the row**, per *freeze values onto rows at write
time*. The Israeli rate has already moved once, 17% to 18%. A rate change decides
what tomorrow's invoice means and must never rewrite what last March's did. The
current rate lives in `settings` and is copied onto each row as it is written.

**Round once, at the edge.** Keep integers exact all the way through core and round
only where a number is rendered. A VAT split that rounds mid-calculation stops
summing to the total, and a budget that is off by an agora looks broken even when
it is not.

## Auth

One shared PIN. One HMAC-signed cookie. No user table, no sessions table, no
NextAuth — there is exactly one person using each of these apps, and the threat
model is "someone guessed the URL", not "someone is attacking my identity provider".

The cookie holds no secret: an issue timestamp and an HMAC of it, so a stolen cookie
cannot be turned back into the PIN. It lasts a year, because the phone should not be
asked again every week.

**Web Crypto only, never `node:crypto`** — middleware runs on the edge runtime,
where `node:crypto` does not exist.

**Fail closed.** If the PIN environment variable is unset in production, the app
seals itself and says so. Development is left open so `npm run dev` needs no setup.

Machine endpoints (ingest, backfill) carry their own `x-api-key` check inside the
route and are exempt from the cookie gate, because a Shortcut has a key but no
cookie. Read endpoints accept the key too, so a widget can fetch without a cookie.

### More than one person

The shared PIN is Stride's pattern, not the collection's — see Assumption 3, which
is refuted. Three apps (`stride2mortgage`, `edu`, `sap`) carry real `users` and
`sessions` tables. State the rule as: **one shared PIN where there is exactly one
person, a real session model where there is more than one.**

The house shape, read from `stride2mortgage`'s live schema on 2026-09-17:

```
users     id · username · display_name · pin_hash · household_id
          · failed_attempts · locked_until · created_at · updated_at
sessions  token_hash · user_id · created_at · expires_at · last_seen_at
```

A username and a PIN, hashed. Brute force is handled by `failed_attempts` and
`locked_until` on the user row rather than by rate limiting the route — the lockout
survives a restart and an attacker changing IP, which a route-level counter does
not. Sessions are rows, and the token is stored **hashed**, so the table is a set of
revocable references rather than a set of live keys.

**Keep the gate free of database calls.** Middleware runs on the edge in front of
every request; a session lookup there puts a round trip on the critical path of the
entire app. Sign the user id into the cookie so middleware verifies with HMAC alone,
and let the `sessions` row carry revocation and `last_seen_at`, checked in routes
where a round trip is already being paid for.

`household_id` is `stride2mortgage`'s grouping and is not general. Drop it wherever
every user belongs to the same single thing.

## Design

Read `app/globals.css` before changing any styling. It is a system, not a starting
point.

- **Tokens on `:root`.** Light and dark are the same design; only the tokens change,
  and no component below them knows which theme it is in. Dark values go in a
  `@media (prefers-color-scheme: dark)` block that redefines tokens only.
- **One accent colour**, and it should mean something specific. Additional colours
  are permitted only where they carry a distinct meaning, and should differ in role
  and weight, not just hue.
- **Form carries meaning before colour does.** Filled, dashed, hollow, faint —
  a view should still parse in greyscale. Colour is reinforcement, never the only
  signal.
- **One dominant element per screen.** Decide what the screen is for and let that
  thing be biggest.
- Fonts via `next/font/google` at **pinned weights**, not variable. Naming the
  weights ships small static instances instead of every axis.
- Small consistent radii. At most one shadow, and warm rather than black.
- PWA: manifest, `themeColor` entries for both schemes, and icons **generated from
  code** by a script rather than drawn, so the palette lives in one file.
- Every interactive target clears 44px. Bottom navigation, because these are phone
  apps held in one hand.

### The phone is the target, so test on one

Four things bit stride2palette on an iPhone that no amount of desktop testing
would have surfaced. All four are general.

**1. A dialog effect that depends on `onClose` steals focus on every keystroke.**
Callers pass `onClose={() => setThing(null)}`, a new function identity on every
render. An effect with `[onClose]` in its dependency array therefore tears down
and re-runs on *every* render — and if it calls `focus()`, it pulls focus out of
the field being typed in. On a phone that closes the keyboard after every single
letter, which reads as the app being broken rather than as a focus bug.

Run such an effect once, with `[]`, and read the handler from a ref. Focus the
dialog only when focus is not already inside it, so an autofocused first field
is not fought over.

**2. Safari zooms the page when a focused field is under 16px**, and does not
zoom back out. State `font-size: max(16px, 1rem)` on every field rather than
inheriting it, so a later change to the base size cannot reintroduce it.

**3. `interactive-widget: 'resizes-content'` in the viewport export.** Without
it the keyboard is drawn *over* the page, `100dvh` keeps counting the covered
area, and a bottom sheet ends up underneath the keyboard. With it the viewport
shrinks and the sheet stays where the person is looking. Pair it with
`scroll-margin-block` on fields, or the browser scrolls a focused field flush
against the keyboard with its label hidden.

**4. `touch-action: manipulation` on everything tappable**, or Safari holds
every tap for ~300ms in case it becomes a double-tap zoom. On a page with
nothing zoomable that delay is pure lag, and it is the single biggest reason a
web app "feels like a website".

## Tests

Vitest, `environment: 'node'`, over the pure modules. Cover the cases that actually
bite rather than chasing coverage: boundaries, late-arriving data, a setting changed
part-way through history, month and year boundaries, and anything involving dates.

`npm test` must pass before anything is pushed.

## Deploy

Vercel project linked to the GitHub repo. **Merging to `main` deploys.** Do not push
non-git deployments into a linked project — it detaches the deployment from the
commit and the next git push overwrites it anyway.

### What an agent session needs to deploy without you

Learned the hard way on stride2do, 2026-09-15. **Set these up once and every
later app deploys in one step; skip it and every app ends with the same three
manual clicks.**

A Claude Code session running in the cloud has none of your laptop's
credentials. It gets read-only connectors, and those are not enough:

| | |
| --- | --- |
| Vercel MCP connector | can **read** projects and deployments. Cannot create a project — `403 forbidden`. Has **no environment-variable tool at all.** |
| Supabase MCP connector | can run SQL and apply migrations. Exposes **publishable** keys only; the service-role key is withheld by design. |

**Note on key names, 2026-09-17.** Supabase's dashboard now calls these
**Publishable** and **Secret** keys, and the secret one reads `sb_secret_...`
rather than being a service-role JWT. It is the same credential for our purposes:
server-only, bypasses RLS. Keep the variable named `SUPABASE_SERVICE_ROLE_KEY`
across the collection and paste the new value into it. The trap is the
publishable key, which looks like the obvious choice and fails silently — with
RLS on and zero policies, an app holding it starts perfectly and then finds every
table empty.

So from a cloud session the deploy stalls on exactly two secrets, neither of
which is about the app:

1. **`VERCEL_TOKEN`** — without it there is no way to create the project, set
   env vars, or deploy. With it, install the CLI and the whole thing is one
   pass: create, link, `vercel env add`, `vercel deploy --prod`.
2. **`SUPABASE_SERVICE_ROLE_KEY`** — no connector will ever hand this over.

Put both in the **remote environment's environment variables** (the Claude Code
on the web environment settings — see
https://code.claude.com/docs/en/claude-code-on-the-web), not in chat and not in
the repo. They are then present for every future session in this collection.

Everything else an app needs, a session can produce for itself: `APP_PIN` and
`INGEST_API_KEY` are just random strings, and `SUPABASE_URL` is readable.

Once those two are in the environment, `scripts/vercel-setup.sh` in stride2do
does the whole Vercel side in one command — create, git-connect, set all four
variables on production and preview — and leaves deploying to a push. Copy it
into the next app and change `PROJECT` and `REPO`.

**This is why deploying from a laptop feels like fewer steps.** It is not the
app being harder; it is `vercel` already being logged in there.

### Never import the repo before the code is on the production branch

Learned on stride2palette, 2026-09-17, and it cost an evening.

Vercel detects the framework **once, at import**, and the answer sticks as a
project setting. The repo was imported while `main` still held nothing but a
README, so detection found no `package.json`, saved the preset as **Other**, and
never looked again. The first deploy was a cheerful `READY` serving 404s, which
looked like "the code isn't merged yet" and was not.

The damage shows up *after* the merge. With the preset at Other, Vercel does not
run the Next.js builder at all — it treats the repo as a generic Node project,
finds `middleware.js` at the root, and publishes it as a standalone serverless
function. That fails at runtime with

```
Cannot find module '/var/task/node_modules/next/server'
  imported from /var/task/middleware.js
```

because the middleware is being loaded as raw ESM instead of the bundled edge
artifact the build produced. `next build` locally shows a perfectly correct
`middleware-manifest.json` the whole time, which makes this maddening to
diagnose from the repo. The tell is in the runtime log label:
`serverless-middleware` and `lambdaRuntimeStats: {"nodejs":1}`, where middleware
should be on the edge.

**Two defences, use both:**

1. **Commit a `vercel.json` with `{"framework": "nextjs"}`.** It overrides the
   project setting, so import order stops mattering and a future re-import
   cannot get it wrong either. Every app in the collection should carry one.
2. **Merge to the production branch first, import second.** `scripts/vercel-setup.sh`
   does it in that order for exactly this reason.

If it has already happened: Settings → Build and Deployment → Framework Preset →
Next.js, then redeploy. Changing the preset does not retroactively fix the bad
deployment; it needs a new one.

Secrets are server-only and must never carry a `NEXT_PUBLIC_` prefix. `.env.example`
lists every variable with a comment explaining what it is for and what happens if it
is missing.

## Collection policy

| | |
| --- | --- |
| Supabase | **one Postgres schema per app**, mostly inside one shared project — see below |
| Vercel project | one per app, named `stride2<domain>`, lowercase |
| GitHub repo | one per app, same name |
| PIN | separate per app for now; may become shared later |
| Cross-app linking | none by default; occasional and deliberate when it happens |

**Corrected 2026-09-15.** This file previously said *one Supabase project per
app, named after the app*. That is not what the collection actually does, and
it cannot be: the Supabase free tier allows **two active projects per owner**,
and there are more than two apps.

What is actually there:

| Supabase project | holds |
| --- | --- |
| `Stride` | `public` (Stride), `edu` (stride2edu), `sap` (stride2aws-sap), `stride2do` |
| `stride2mortgage` | `public` (stride2mortgage) |
| 3 others | paused, and paused projects do not count against the limit |

**Updated 2026-09-17, building stride2palette.** Adir chose a dedicated project
for this app and freed the slot by pausing `stride2mortgage`. The active pair is
now `Stride` and `stride2palette`. This is the first app in the collection to take
the isolated-credential option, and the reason is the section above: it is the only
app with more than one human logging in, so its `service_role` key reaching every
other app's tables was a materially worse trade than it is for a single-user app.
**`stride2mortgage` is paused, not deleted** — restoring it from the Supabase
dashboard costs one click and the free tier's second slot.

**Two things about pausing, learned the same day, that the two-slot juggling in
this collection makes worth knowing:**

1. **A pause does not always stick.** `stride2mortgage` was paused, and was
   `ACTIVE_HEALTHY` again when checked later in the same session — and the
   limit had reclaimed the *other* project instead, leaving the app being
   worked on `INACTIVE`. Always re-read the status rather than trusting the
   call that returned `{"success": true}`.
2. **A restored project answers SQL before its data is back.** `stride2palette`
   came up mid-restore reporting **zero tables in `public`** — not an error,
   just an empty schema — and every table, constraint and row was present a
   couple of minutes later once it reached `ACTIVE_HEALTHY`. Do not conclude
   data loss, and above all **do not "repair" it by re-running migrations
   against a half-restored database.** Wait for `ACTIVE_HEALTHY`, then look
   again.

So the real rule is: **the first apps get their own project; everything after
shares one, taking a Postgres schema each.** Name the schema after the app or
its domain word.

Doing it this way keeps the exit cheap — `pg_dump --schema=<app>` moves an app
to a dedicated project with no untangling — but it costs two things, and both
need saying out loud **before** the choice is made, not after:

1. **One blast radius.** Pausing, restoring or hitting a limit on the shared
   project takes every app in it down together.
2. **One key for all of them.** A Supabase project has exactly one
   `service_role` key. It bypasses RLS in every schema it has USAGE on, so the
   key sitting in one app's Vercel project reads every other app's tables too.
   Measured on 2026-09-15: that one key reads all 31 tables across `public`,
   `edu`, `sap` and `stride2do`. RLS does not help here — bypassing it is the
   point of that key — and neither does the per-schema `service_role`-only
   grant, which keeps out the *anon* key, not this one.

Point 2 is the one that gets missed, because per-schema grants look like
isolation and are not. **The only way to get a genuinely separate credential is
a separate project.** Weigh that against the free tier before sharing, rather
than discovering it when handing an app's key to a deployment.

**Setting up a shared-project schema:**

1. `create schema <app>;`
2. `grant usage on schema <app> to service_role;` — **service_role only.**
   `edu` does this; `sap` also grants `anon` and `authenticated`, which is
   looser for no benefit. Follow `edu`.
3. Create the tables, `enable row level security` on each, and add no policies.
4. `grant all on all tables in schema <app> to service_role;` plus the matching
   `alter default privileges`.
5. Expose it to PostgREST, **additively**, then reload:
   ```sql
   alter role authenticator set pgrst.db_schemas = 'public, graphql_public, edu, sap, <app>';
   notify pgrst, 'reload config';
   ```
   Read the current value first and keep every schema already in it. Dropping
   one silently breaks that app's API.
6. In the app, `createClient(url, key, { db: { schema: '<app>' } })`.

**RLS: confirmed across four apps.** Every table in `public`, `edu`, `sap` and
`stride2do` has RLS enabled and **zero** policies. This is the most consistently
followed rule in the collection.

The `2` in `stride2<domain>` is a constant meaning "to" — `stride2mortgage` is
"stride to mortgage". It is not a sequence number. Do not number apps.

## Phone integration

Optional per app, but the pattern exists and works:

- An **iOS Shortcut** POSTs to an ingest endpoint with `x-api-key`. Have it send a
  locally formatted `YYYY-MM-DD` date rather than a UTC instant, so the app files
  data against the phone's calendar date and travel is handled automatically.
- A **Scriptable widget** reads the same API. It is a script copied onto the phone,
  not part of the build, so it does not update when the repo does. It draws with
  `DrawContext`, which has no appearance context — so it cannot resolve a dynamic
  colour and stays single-ground.
- iOS defers automations that read protected data until the device is unlocked, and
  suppresses them in Low Power Mode. **Design for irregular sync.** The absence-is-
  neutral and derive-on-read rules above are what make that harmless; an endpoint
  that accepts a batch of recent days makes each run self-healing.

## Assumptions — status

The nine points this file was unsure of, and where each now stands. "Confirmed"
means observed in a live Stride artefact on 2026-09-15 (the Supabase schema, or
the deployed CSS), not merely remembered.

| # | Assumption | Verdict |
| --- | --- | --- |
| 1 | Plain JavaScript is a collection rule | **Confirmed 2026-09-17.** The source was read directly at last: `Adirdan1/stride` contains zero `.ts` or `.tsx` files, and ships `jsconfig.json` rather than `tsconfig.json`. Settled. |
| 2 | Derived state and the idempotent ledger are expected everywhere | **Confirmed for Stride, and deliberately not followed in stride2do.** Stride really does have `freeze_ledger (key, delta, reason, ref_date)` and no `streak` column anywhere. But the machinery exists to make *reconciliation on every read* affordable, and a task manager has nothing to reconcile. See the deviation log below. |
| 3 | The PIN gate is mandatory for every app | **Refuted.** `stride2mortgage`, `edu` and `sap` all have `users` and `sessions` tables. Three of the five apps with a database use a real session model, not a shared PIN — so the PIN may be Stride's *original* pattern rather than the collection's. The rule is better stated as: *one PIN where there is exactly one person*. Adir confirmed stride2do is single-user and asked for a PIN, so it has one. Worth asking the original skill which way this actually goes. |
| 4 | `lib/core.js` with zero imports, and the core/repo/db/auth/format split | **Confirmed 2026-09-17.** All five filenames exist in `Adirdan1/stride` exactly as named, and `lib/core.js` has literally zero `import` statements across its 894 lines. The reconstruction was right. |
| 5 | Generated icons are a collection requirement | **Confirmed 2026-09-17.** `scripts/generate-icons.mjs` exists in Stride and is wired up as `npm run icons`, exactly as this file guessed. |
| 6 | Shortcut and widget are expected for every app | **Unverified.** Adir confirmed he uses both with Stride and wants the same here. Treated as optional-but-provided. |
| 7 | The design rules are collection-wide; a logo design language exists | **Confirmed, and the logo language is now recovered.** See *Design language*, below — this was the biggest gap in the file and it is closed. |
| 8 | The testing bar is "cover what bites" | **Still unverified as a stated rule, and the number was wrong.** Stride has **381** tests across 14 files, not 94 — so the real bar is far higher than this file claimed, and stride2do's 110 is below it rather than above. Treat 381 as the collection's demonstrated standard. |
| 9 | Nothing found about error handling, logging, analytics, rate limiting | **Still nothing.** Stride ships no analytics script and no error reporter that is visible from the client. Genuinely open. |

## Design language — recovered 2026-09-15

Read out of the deployed Stride stylesheet. This is fact, not inference.

**The mark.** Every app's mark is *a single form built from three tonal layers*,
gently animated, and legible in greyscale. Stride has two: a flame
(`.flame__body` / `__inner` / `__core`, filled from `--flame-deep` / `--flame-lit`
/ `--flame-core`) and an iceberg (`.berg__deep` / `__tip` / `__facet`) for
freezes. Each layer runs its own slow keyframe loop at a different period, so
the motion never looks synchronised, and the whole thing sits inside
`@media (prefers-reduced-motion: no-preference)`.

The mark has a **second state** for the app's null condition — `.flame--cold`
and `.berg--empty` both drop to `--line-strong` / `--line` and blank the core.
The state differs in *form and weight*, not only colour.

**The wordmark** is the app name in the display face followed by a full stop in
the accent colour: `stride<span class="brand__mark">.</span>`.

**The icon mark is a different mark, and it is the family's.** Recovered
2026-09-17 from `scripts/generate-icons.mjs` in Stride, which earlier sessions
could not read. This file previously described only the on-screen mark and left
the impression that the icon was the same drawing; it is not, and the distinction
is load-bearing.

The icon is **the climb**: four rising bars, the tallest one live, topped by a
summit that says what that app is climbing towards. Stride's summit is a flame,
stride2mortgage's is a house, stride2palette's is a lit doorway. In Stride's own
words, *"the climb is constant across the family so the apps read as siblings;
only the summit changes"* — and it is the same object the app already draws, a
segmented progress bar stood on its end, rather than a decoration applied on top
of one.

So each app has **two** marks: the three-layer animated form on screen, and the
climb with its own summit on the home screen. The palette is per app; the climb
is not.

The generator is worth copying rather than rewriting. It encodes PNG by hand
from `node:zlib` with no image library at all, and draws shapes as a predicate
("is this point inside?") sampled 4×4 per pixel, so a rounded bar, a circle, a
triangle and an arch all draw through one code path.

Three lessons are recorded in its comments and all three were re-learned building
stride2palette's summit, which suggests they are general:

- **A shape balanced on the live bar reads as a lollipop.** Sink it into the bar
  so there is no waist where the two meet.
- **A bare silhouette on a narrow column reads as an arrow.** Stride's note is
  that what makes a roof a house is having walls under it; what makes an arch a
  doorway is light inside it and a leaf standing across that light.
- **A summit layer drawn in the live bar's own colour fuses with the bar.** Give
  each layer its own tone even when they are shades of the same hue.

**The faces are fixed across the collection:**

| | |
| --- | --- |
| Display | **Fraunces**, weight 700 only |
| Sans | **Archivo**, weights 400 / 500 / 600 |

Both via `next/font/google` at those pinned weights.

**The shared tokens** — identical in stride2do, and they are the collection's,
not Stride's:

```
--paper #f7f4ee   --surface #fffdfa   --sunken #efe9df
--ink   #1b1a17   --ink-2   #57534b   --ink-3  #6f6a61
--line  #e5ded2   --line-strong #cec4b3
--radius-sm 6px   --radius 12px   --radius-lg 20px   --radius-pill 999px
--lift 0 1px 2px rgba(69,48,28,.05), 0 8px 24px -12px rgba(69,48,28,.18)
--measure 30rem   --pad 1.15rem   --spine 3px
```

Dark redefines tokens only, and sets `--lift: none`.

**Accents are per app, and carry the app's meaning:**

| app | accent | second colour | third |
| --- | --- | --- | --- |
| Stride | `--ember #bd5417` the streak | `--frost #2f75a0` freezes | `--break #a52f28` a miss |
| stride2do | `--plum #6b3f6b` | — | `--break #a52f28` slipped |
| stride2palette | `--ragu #b4472f` cleared | `--cheese #8a6008` a deadline closing | `--break #5f1f28` overdue |

`--break` appears to be shared across the collection and to mean the same thing
in both: *this went wrong*. Treat it as reserved.

**One caveat on the 44px rule.** Stride's own `.chip` is `min-height: 2.5rem`
(40px), below the 44px this file states. `.btn` is exactly 2.75rem (44px). So
either the rule is 44px for primary targets only, or Stride quietly breaks it.
stride2do holds every target at 44px, including chips.

## Decisions and deviations — stride2do

Recorded as made, per the rule at the top of this file. Three of these are
deliberate departures from what is written above.

**1. No event ledger. (Deviation from *Events go in a ledger, not a counter*.)**
Completion is `tasks.completed_on`, a date on the row. The ledger pattern exists
so that derived state can be recomputed on every read without the recomputation
getting more expensive over time — which matters enormously for a streak, where
one late-arriving day rewrites the meaning of everything after it. A task
completes once and nothing downstream depends on the order it happened in, so
there is nothing to reconcile and the ledger would be cost with no benefit. If
recurrence is ever added, revisit this first: a recurring task *does* have a
history that late data can rewrite.

**2. Nothing is frozen onto rows. (Deviation from *Freeze values onto rows at
write time*.)** That rule protects against a setting change retroactively
rewriting what a past row meant. stride2do has exactly one setting, `timezone`,
and it is a lens rather than a rule — it decides which day *now* is, never what
a past row demanded. There is nothing whose meaning a setting could change, so
there is nothing to freeze. Adding any setting that shapes a task's meaning
(a default due offset, a working-day calendar) means this rule comes back.

**3. Derived state is kept, in full.** No counter is stored anywhere. `done` is
`completed_on is not null`; the NOW / NEXT / SOMEDAY bands, the overdue count
and everything the widget shows are computed by `groupTasks` / `summarise` on
every read. A task silently moves from NEXT to NOW as the day turns, with no
write and no cron.

**4. Idempotency without a ledger.** `tasks.source_key` is unique and
deterministic: `capturedOn|due|normalised-title`. A Shortcut that fires twice,
or retries after a dropped connection, lands one task; the same title captured
again next week is a genuinely different task. This is the ledger's idempotency
discipline kept, on a table that is not a ledger.

**5. The accent is `--plum #6b3f6b`, and the mark is the app's own row
anatomy.** Plum was chosen knowing it carries no inherited meaning — orange
reads as heat, green as done, red as wrong; plum reads as nothing. That forces
form to carry the meaning, which is this file's rule stated harder than Stride
states it. The mark is the spine and the weight ladder that every task row is
built from, so the identity is the interface rather than decoration attached to
it. Two earlier marks were built and rejected for meaning the wrong thing at
small sizes: interlocking rings read as an infinity symbol, and a ring with a
cord through it read as a prohibition sign.

**6. Overdue is signalled by form first.** The spine down each row is the
signalling system: solid plum for due now, **segmented** for overdue, solid
faint for next, dashed for someday, none for done. Overdue was originally solid
`--break`, and a greyscale check showed it indistinguishable from due-now —
colour was doing all the work, which this file forbids. Segmenting it fixed
that. **Run that check on any new row state.**

**7. Bands, not a flat sort.** NOW / NEXT / SOMEDAY, with overdue folded into
NOW rather than given its own band. A thing due on Tuesday is the same work as
a thing due today, just later; a separate OVERDUE band makes the page longer
without making the decision easier.

**8. One extra day is read, and only today is shown.** The page queries
completions from yesterday onward but renders only today's, so a task completed
just before midnight does not vanish mid-session when the date turns under it.

**9. The database is a schema inside the shared `Stride` Supabase project,
not its own project.** Chosen by Adir against my recommendation to upgrade —
and then vindicated, because inspecting the project showed `edu` and `sap`
already living there the same way. It is the house pattern, not an exception.
The tables are namespaced in `stride2do` and granted to `service_role` only,
so leaving later costs one `pg_dump --schema=stride2do`. The standing risk is
shared blast radius: anything that takes the `Stride` project down takes this
app with it.

**10. Testing.** 110 tests over `core`, `format` and `auth`, run in under a
second. `toDayNumber` is cross-checked against `Date.UTC` across 80,000 days as
an independent oracle. Note for whoever hits it next: `Date.UTC` maps years
0–99 to 1900–1999, so it is not a valid oracle below year 100.

## Decisions and deviations — stride2palette

Recorded as made, per the rule at the top of this file. The app is a pre-opening
launch board for a small venue selling lasagna, alcohol and coffee.

**1. Its own Supabase project. (Deviation from *one Postgres schema per app inside
one shared project*.)** Every other app takes a schema in `Stride`; this one has
`stride2palette` (`niyfawkpjlkrspyutjmx`, eu-central-1) to itself, paid for by
pausing `stride2mortgage`. The reason is point 2 of the shared-project warning
above, and it is specific rather than general: this is the collection's first app
with **more than one human logging in**. A `service_role` key that also reads four
other apps' tables is an acceptable trade when the only person holding it is the
person who owns those apps, and a worse one the moment staff have accounts. If this
app ever drops back to a single user, the shared schema becomes the right call
again.

**2. Multi-user, following `stride2mortgage` rather than Stride.** `users` and
`sessions` as described under *More than one person*, minus `household_id` — there
is one venue and everyone in `users` is staff of it. No roles and no permissions in
v1: everyone can see and edit everything. That is a real decision, not an omission.
A venue this size has no information one member of staff should be kept from, and
roles are the kind of thing that is cheap to add when a real need appears and
expensive to guess at in advance.

**3. Actual spend is a ledger; planned spend is a frozen column. (Follows *events go
in a ledger*, where stride2do deviated from it.)** `items.planned_agorot` is what
you expected to pay, frozen at write time and never recomputed. Actual spend is
`sum(payments.gross_agorot)` for the item, derived on every read, with no
`actual_agorot` column anywhere.

The ledger earns its place here for the reason it did not in stride2do. A task
completes once and nothing downstream depends on the order; a licence is paid as a
deposit and then a balance, sometimes months apart, sometimes partly refunded when
an application is withdrawn. That is a history, and a history that late data can
rewrite — which is exactly the shape the ledger exists for. Each payment carries the
VAT rate in force when it was made.

**4. `waiting` is a first-class status**, alongside `todo`, `doing`, `done` and
`dropped`. A permit application sitting with the municipality is not work you have
not started, and for this app the difference is most of the anxiety: one of those
states means *do something*, the other means *you have done your part*. Collapsing
them into `doing` would make the board unable to answer the only question it is
really for.

**5. The design language is "Lasagna", and the accent is `--basil #3f6b33`,
meaning *cleared*.** Adir asked for the venue's dish to be the palette, and it
turns out to be a good one: pasta and ricotta for the ground, basil for the
accent, baked cheese for a closing deadline, and the ragù is already the exact
red the collection reserves for `--break`. So overdue is tomato without anything
being bent to make it so.

Measured, not guessed: basil is 6.00:1 on surface and 5.60:1 on paper, cheese
5.37 and 5.01, break 6.65 and 6.20. **Cheese took three attempts.** Every
obvious melted-cheese yellow fails on a cream ground — `#a8761a` is 3.57:1 on
paper — and the answer was to go much darker than looks right in isolation. If
another app in this collection wants a gold on a warm ground, start around
`#8a6008` rather than working down from a yellow.

This file warns that green reads as *done* and should not be reached for lazily.
Here the inherited meaning is the correct one: the app is a list of approvals
that are either granted or not, and *cleared* is the literal thing the colour has
to say.

**6. One screen.** `/` is the Launch Board; `/unlock` is the gate. Settings and
people management live in sheets on that screen rather than in pages of their own.
The collection's *one dominant element per screen* rule puts the countdown to
opening day at the top, with planned-versus-actual spend on the spine bar beneath
it.

**7. The hero degrades honestly when there is no opening date.** `target_open_date`
is nullable. With a date the hero counts down; without one it becomes the count of
things still in the way, and becomes a countdown the moment a date is set. It must
never render a countdown to a date nobody chose.

**8. Manual entry only in v1.** No Shortcut, no widget, no ingest endpoint. Stride
and stride2do both have one because they capture something that happens many times
a day away from a keyboard. Pre-opening data is a few items a week and arrives while
reading an invoice. Adding an `x-api-key` path with nothing to put through it would
be machinery for its own sake — revisit when the venue opens and daily sales start
arriving.

**9. Signing in lasts a year, even though this app has staff in it.** Adir's
call. It was thirty days first, reasoning that a multi-user app holding a
business's finances has a worse failure case than one person's phone — a device
that left with somebody, rather than somebody staying signed in.

The year stands because the multi-user apps have something Stride does not: a
`sessions` table. An expiry is a blunt instrument aimed at a problem revocation
solves precisely and immediately, and the friction of a short expiry lands on
people trying to do their jobs rather than on the person you are worried about.
**So in any app in this collection with a sessions table, prefer revoking a row
over shortening the cookie** — and say plainly that revoking is a thing somebody
has to remember, where an expiry is not.

**10. The mark is an artist's palette**, matching the app's name, in the three
tonal layers the collection requires: the board, the darker rim along its
underside, and the paint. The four dabs are the four layers of a lasagna —
pasta, ragù, cheese, basil — so the app's colour system sits on its own logo.

The first version was rejected by Adir as looking like "an amateur drawing of a
palette", and he was right. Two things fixed it, and both are general:

- **The silhouette needs the waist.** An ellipse with dots on it is clip-art.
  What the eye actually recognises is the concave pinch on the lower right where
  the hand goes, and it survives being shrunk to 30px. The icon summit needed
  the same correction — there it is an ellipse with a circle subtracted from its
  lower-right edge.
- **The board must be light and the paint bright.** The first version drew a
  dark board and used the app's own accents as paint. Those are dark *by
  construction* — they exist to clear 4.5:1 on cream — so four of them on a
  board sat at almost the same value and vanished in greyscale. **Paint is a
  graphic, not text, and takes the bright values.** Worth stating generally: the
  text palette and the illustration palette are not the same palette, and
  reaching for the accent tokens inside a mark is usually a mistake.

The thumb hole is punched with `fill-rule: evenodd`, so it is a real hole and
shows whatever the mark sits on; painted in the page colour it would stop being
a hole the moment it was placed on a card. The null condition empties the
palette rather than recolouring it — and `--line` was too pale for the board
there, so it takes `--line-strong`: unused must still read as a palette, or the
hero looks broken before an opening date is set.

**Render marks and look at them.** All of the above was found by screenshotting
candidates with the headless Chromium that ships in these sandboxes
(`/opt/pw-browsers/chromium-*/chrome-linux/chrome --headless --screenshot`),
at 88px, 44px and 27px, in both themes and in greyscale, against paper and
against a card. Reasoning about an SVG path is not a substitute for seeing it.
Build the harness from the real `globals.css` rather than a copy of the tokens —
two of the "bugs" found this way were the harness dropping variables the real
cascade provides.

**11. Pull-to-refresh is adopted from Stride rather than reinvented.** Adir asked
for it and Stride's `PullToRefresh.js` already solves it well: square-root
resistance on the drag, `preventDefault` only once the gesture is known to be
ours, and `router.refresh()` to re-run the server components. It earns more here
than it does in Stride, because this app has several people in it — pulling down
is how somebody else's edits reach your screen. The indicator is the spine in its
third orientation, and it segments while working rather than only changing
colour, following the same form-before-colour rule as the row rails.

## Decisions and deviations — stride2palette, second pass

The app grew from one board into eight pages, several people and live editing.

**12. Two reds on one screen, separated by value rather than hue.** Adir asked
for the accent to be the ragù, knowing it costs the obvious reading of green for
done and collides with the collection's reserved `--break`. The resolution is
the design system's own first rule: *form carries meaning before colour does.*
On-track is a solid spine, overdue is segmented, and they are never confused even
in greyscale.

Colour still helps in light, where the wine is **2.27× darker** than the accent.
In dark it cannot: both reds must be light enough to clear 4.5:1 on near-black,
which compresses them into one band — **1.4× is the best separation achievable**.
So dark leans on hue, a cool rose against a warm orange, and on the form. Worth
knowing before anyone else tries two of one hue: *light themes have room for a
value trick and dark themes do not.*

**13. Domains are many-to-many, and that is why there is no money breakdown by
area.** A task carries any number of domains and appears on every matching page,
because an espresso machine contract is genuinely Coffee and Finance and making
it choose is how it goes missing from whichever page somebody opens. The
consequence is that no per-domain total can be honest: a multi-domain cost would
be counted twice and the parts would not sum to the whole. `summariseBudget`
therefore reports one figure for the venue and no breakdown at all. **A figure
that does not add up is worse than no figure.**

**14. The edit lock is a lease, not a lock.** Opening a task claims it for sixty
seconds and the browser refreshes that while the sheet is open; everyone else
sees a read-only form naming the holder. The distinction is the whole design: a
lock has to be handed back, and somebody will always shut a laptop instead — a
lease simply stops being true.

Two things make it correct rather than decorative. The claim is a single
conditional `update` whose `or` filter accepts only an unheld, expired, or
self-held row, so **Postgres decides the race** and two people cannot both win.
And the lease is checked again on the write itself: a disabled form is a
courtesy, not a guarantee, and a stale tab that never saw the lock must still be
refused.

**15. Polling, not Realtime.** Five seconds, paused while the tab is hidden.
Supabase Realtime would mean the browser holding a publishable key and talking to
the database directly, which means writing RLS policies — and *every table in
this collection has RLS on with zero policies*, its most consistently followed
rule. A poll on a board of tens of rows buys the same liveness for none of that.

**16. A task cannot be marked done without a conclusion.** The one piece of
deliberate friction in the app. A finished task with nothing written about how it
finished is exactly what a launch board exists to prevent — three months later
nobody remembers which supplier was chosen or what the inspector actually said.
`dropped` is exempt: abandoning something is not an outcome worth writing up, and
demanding one would only teach people to type a full stop.

**17. Render the page, not just the mark.** The component screenshots that caught
the clip-art palette caught two more bugs here — descriptions running inline with
their titles, because a row body is built from spans (a `<button>` may not contain
block elements) and *spans do not stack*. It also produced one false alarm:
Chromium gave a 500px viewport while capturing a 440px image, so content appeared
clipped that was not. **Measure before fixing**: a probe script reporting
`document.body.scrollWidth` and any element wider than the viewport settled it in
one render, and should be the first move whenever a layout looks like it
overflows.

**18. A scrolling navigation needs a visible edge, or it reads as a missing
feature.** Eight destinations do not fit across a phone, so the bottom nav
scrolls. The first version cut the last two off at the hard edge of the screen
with no hint they existed, and they were immediately reported missing — the
person was right, because a control nobody can see is not a control.

Two cheap fixes, and both are general: a `mask-image` fading each end so the row
visibly continues past it, and `scrollIntoView({ block: 'nearest', inline:
'nearest' })` on the current item so a deep section is never stranded off-screen
on arrival. `nearest` matters — centring on every navigation yanks a bar that was
already fine.

**19. The top bar names the app, not the page.** Putting the section name in the
brand slot meant a page headed "Finance" under a bar reading "Finance", on a
screen with room for neither. The page names itself once, in its own heading.

**20. `dir="auto"` on a container is unreliable the moment its children carry
`dir` too — derive direction from the title instead.** Once the board filled with
Hebrew, task rows and step rows still laid out left-to-right: the ring, the
spine and four levels of indent all sat on the side an RTL reader finishes at,
which made the nesting levels look identical.

The trap is in the spec. `dir="auto"` picks the first strongly directional
character **excluding any descendant that has its own `dir`** — and in a row
built properly, every string worth reading already has one. So the container's
sniff fell through to whatever was left over: the owners line on most rows, and
the English word "Conclusion" on any row that had one, which flipped that row
back to LTR while its neighbours were RTL. Inconsistent direction inside one list
is worse than uniformly wrong direction.

The fix is a pure four-line helper, `directionOf(text)`, and `dir={directionOf(item.title)}`
on the row. The title is what the row is about, so the answer is both correct and
stable. Two rules follow for the collection:

- **Sniff explicitly, from the field that defines the thing.** Never let a
  container guess when its children carry `dir`.
- **Direction-agnostic CSS is not optional once content can be RTL.** Physical
  properties silently stop matching: `.row` had `padding-left` making room for a
  spine at `left: 0.55rem`, so a flipped row put its padding on one side and its
  spine on the other. `padding-inline`, `inset-inline-start`, `text-align: start`
  and `margin-inline-start` cost nothing to write first and are invisible to fix
  later. The nested-step indent already used `-inline-start` and needed no change
  at all — that is the whole argument.

**21. A hint that has been ignored for the life of the app is not a hint, it is
a missing alert — and an alert must carry its own fix.** The overview's opening
day had always degraded quietly: the hero fell back to counting open work, with
a grey line underneath offering settings. It was polite, it was correct, and the
date was still unset weeks later with seventeen tasks on the board.

That is the tell. When a state is both *wrong* and *persistent*, the quiet
fallback is the bug. Two rules:

- **Escalate on evidence, not on taste.** A fallback that has never once been
  acted on has failed, whatever it looks like. Say the thing loudly instead.
- **Never report a problem you could also let someone fix.** The alert carries a
  button that opens settings *focused on the field it is complaining about*.
  Telling a person something is missing and leaving them to find where to set it
  is half a feature.

Mechanically, the sheet is owned by the shell, so reaching it from inside a page
needs a small context (`useSettingsSheet`) rather than every page forwarding a
prop it does not otherwise care about.

On colour: the wine `--break`, never the accent. The accent means *this is the
app*; the wine means *something is wrong*, and it is already what overdue work
uses. Measured both ways — `--break` on `--break-wash` is 9.65:1 light and
7.94:1 dark, the solid button 12.26:1 and 9.02:1 — and the form carries it too,
with a rule down the leading edge and a tinted ground that both survive
greyscale.

One harness note that cost a render: headless Chromium reports
`prefers-color-scheme: light`, so a dark screenshot needs the real stylesheet
with `@media (prefers-color-scheme: dark)` rewritten to `@media all`. Rewrite
the query; never hand-copy the dark token values into a harness.
