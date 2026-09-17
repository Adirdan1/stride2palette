-- stride2palette: initial schema.
--
-- A pre-opening launch board for a small venue. Every table here is reached only
-- from the server, with the service role key. RLS is enabled with no policies at
-- all, so an anon or publishable key sees nothing even if one is ever exposed.
-- The service role bypasses RLS by design.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- settings: exactly one row, pinned to id = 1.
--
-- target_open_date is nullable on purpose. Without it the screen shows how many
-- things are still in the way instead of counting down; it must never render a
-- countdown to a date nobody chose.
-- ---------------------------------------------------------------------------
create table if not exists settings (
  id               int  primary key default 1 check (id = 1),
  timezone         text not null default 'Asia/Jerusalem',
  -- Basis points: 1800 is 18%. The current rate only decides what *new* rows
  -- mean — every payment carries the rate it was actually charged at.
  vat_rate_bp      int  not null default 1800 check (vat_rate_bp >= 0),
  target_open_date date,
  updated_at       timestamptz not null default now()
);

insert into settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- users: the staff who can open the app.
--
-- Following stride2mortgage, which is the collection's multi-user pattern, minus
-- its household_id — there is one venue and everyone here belongs to it.
--
-- failed_attempts and locked_until live on the row rather than in a rate limiter
-- because a counter in the database survives a restart, a new edge region and an
-- attacker changing IP. A counter in memory survives none of those.
-- ---------------------------------------------------------------------------
create table if not exists users (
  id              uuid primary key default gen_random_uuid(),
  username        text not null unique,
  display_name    text not null,
  -- pbkdf2$<iterations>$<salt>$<hash>. Self-describing so the work factor can be
  -- raised later without invalidating every existing PIN.
  pin_hash        text not null,
  failed_attempts int  not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- sessions: revocation and last-seen, not authentication.
--
-- The cookie is self-verifying (an HMAC over the user id and issue time), so the
-- edge middleware never reads this table — putting a database round trip in front
-- of every request in the app is exactly what that design avoids. This exists so
-- a session can be revoked before it expires, and so you can see who was last in.
--
-- The token is stored hashed, which makes this a set of revocable references
-- rather than a set of live keys somebody could walk off with.
-- ---------------------------------------------------------------------------
create table if not exists sessions (
  token_hash   text primary key,
  user_id      uuid not null references users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now()
);

create index if not exists sessions_user_id_idx on sessions (user_id);
create index if not exists sessions_expires_at_idx on sessions (expires_at);

-- ---------------------------------------------------------------------------
-- items: everything that has to happen before the doors open.
--
-- planned_agorot is frozen intent: what you expected to pay when you wrote the
-- item down. It is never recomputed from what actually happened.
--
-- There is deliberately no actual_agorot column. Actual spend is the sum of the
-- payments ledger below, derived on every read.
-- ---------------------------------------------------------------------------
create table if not exists items (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (length(btrim(title)) > 0),
  category       text not null default 'other'
                   check (category in ('licence', 'permit', 'location', 'fitout',
                                       'equipment', 'supplier', 'marketing', 'other')),
  -- 'waiting' is its own status, not a flavour of 'doing': a permit sitting with
  -- the municipality is not work nobody has started. One means do something, the
  -- other means you have done your part.
  status         text not null default 'todo'
                   check (status in ('todo', 'doing', 'waiting', 'done', 'dropped')),
  due            date,
  planned_agorot bigint not null default 0,
  owner_id       uuid references users (id) on delete set null,
  note           text,
  position       int  not null default 0,
  created_by     uuid references users (id) on delete set null,
  updated_by     uuid references users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists items_status_idx on items (status);
create index if not exists items_due_idx on items (due);

-- ---------------------------------------------------------------------------
-- payments: the ledger actual spend is derived from.
--
-- gross_agorot is what the invoice said, VAT included, and may be negative — a
-- withdrawn application that refunds its fee is a negative payment rather than a
-- deleted one, so the record of what actually moved stays intact.
--
-- vat_rate_bp is frozen onto the row. The Israeli rate has already moved once,
-- 17% to 18%. A rate change decides what tomorrow's invoice means; it must never
-- rewrite what last March's did.
--
-- on delete restrict, not cascade: an item with money against it cannot be
-- deleted out from under its own financial history. Use the 'dropped' status
-- instead, which is what it is for. Deletion is for things entered by mistake,
-- and then the payment has to go first, deliberately.
-- ---------------------------------------------------------------------------
create table if not exists payments (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references items (id) on delete restrict,
  paid_on      date not null,
  gross_agorot bigint not null,
  vat_rate_bp  int  not null check (vat_rate_bp >= 0),
  note         text,
  created_by   uuid references users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists payments_item_id_idx on payments (item_id);

-- ---------------------------------------------------------------------------
-- Lock everything down. No policies are created on purpose.
-- ---------------------------------------------------------------------------
alter table settings enable row level security;
alter table users    enable row level security;
alter table sessions enable row level security;
alter table items    enable row level security;
alter table payments enable row level security;
