-- stride2palette: several owners per task, nested steps, and the shared fund.

-- ---------------------------------------------------------------------------
-- item_owners: a task can be carried by more than one person.
--
-- Three of the tasks on this board are "the three of us" — the partnership
-- agreement, the kashrut decision, the tasting date. A single owner column
-- forces one name onto work nobody can do alone, and the person page then lies
-- about who is responsible.
-- ---------------------------------------------------------------------------
create table if not exists item_owners (
  item_id uuid not null references items (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  primary key (item_id, user_id)
);

create index if not exists item_owners_user_id_idx on item_owners (user_id);

insert into item_owners (item_id, user_id)
select id, owner_id from items where owner_id is not null
on conflict do nothing;

alter table items drop column if exists owner_id;

-- ---------------------------------------------------------------------------
-- subtasks.parent_id: steps within steps, up to five levels.
--
-- Self-referencing rather than a separate table per level, obviously. The depth
-- limit is enforced in the application: a check constraint cannot see an
-- ancestor chain without a recursive query, and the failure a person should get
-- is a sentence explaining the limit, not a constraint violation.
-- ---------------------------------------------------------------------------
alter table subtasks add column if not exists parent_id uuid references subtasks (id) on delete cascade;

create index if not exists subtasks_parent_id_idx on subtasks (parent_id);

-- ---------------------------------------------------------------------------
-- fund_deposits: the shared pot.
--
-- A ledger, like payments: the balance is the sum of the rows and is never
-- stored. A withdrawal is a negative deposit, so the history of what actually
-- moved survives rather than being edited away.
-- ---------------------------------------------------------------------------
create table if not exists fund_deposits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users (id) on delete restrict,
  amount_agorot bigint not null,
  deposited_on  date not null,
  note          text,
  created_by    uuid references users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists fund_deposits_user_id_idx on fund_deposits (user_id);
create index if not exists fund_deposits_deposited_on_idx on fund_deposits (deposited_on);

-- What the pot is aiming at, so the chart can show progress against something.
-- Nullable in spirit: zero means "no target set" and the chart simply omits the
-- line rather than drawing progress towards nothing.
alter table settings add column if not exists fund_target_agorot bigint not null default 0;

alter table item_owners    enable row level security;
alter table fund_deposits  enable row level security;
