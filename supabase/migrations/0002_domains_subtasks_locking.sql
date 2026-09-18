-- stride2palette: domains, subtasks, conclusions and edit locking.
--
-- The app grew from one board into several pages: an overview, a page per
-- person, and a page per domain of responsibility. That changes three things
-- about the shape of an item.

-- ---------------------------------------------------------------------------
-- domains: the areas of responsibility the venue is divided into.
--
-- A table rather than a check constraint, because these are navigation — each
-- one is a page — and adding a seventh should not require a migration and a
-- deploy. `position` fixes the order of the tabs.
-- ---------------------------------------------------------------------------
create table if not exists domains (
  key      text primary key,
  label    text not null,
  position int  not null default 0
);

insert into domains (key, label, position) values
  ('kitchen',   'Kitchen',   1),
  ('finance',   'Finance',   2),
  ('alcohol',   'Alcohol',   3),
  ('coffee',    'Coffee',    4),
  ('marketing', 'Marketing', 5),
  ('brand',     'Brand',     6)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- item_domains: a task can belong to several domains at once.
--
-- Many-to-many rather than a column, because a supplier contract for the
-- espresso machine is genuinely both Coffee and Finance, and forcing a choice
-- means it goes missing from one of the two pages somebody is looking at.
-- ---------------------------------------------------------------------------
create table if not exists item_domains (
  item_id uuid not null references items (id) on delete cascade,
  domain  text not null references domains (key) on delete cascade,
  primary key (item_id, domain)
);

create index if not exists item_domains_domain_idx on item_domains (domain);

-- ---------------------------------------------------------------------------
-- subtasks: the steps inside a task, and what the progress ring counts.
-- ---------------------------------------------------------------------------
create table if not exists subtasks (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references items (id) on delete cascade,
  title      text not null check (length(btrim(title)) > 0),
  done       boolean not null default false,
  position   int  not null default 0,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists subtasks_item_id_idx on subtasks (item_id);

-- ---------------------------------------------------------------------------
-- items: description, conclusion, and the edit lock.
--
-- `description` is what the task is. `conclusion` is what happened, and it is
-- required before a task may be marked done — a finished task with nothing
-- written about how it finished is the thing this app exists to prevent.
-- The rule is enforced in the API rather than as a check constraint, so the
-- person gets a sentence explaining it rather than a constraint violation.
--
-- `locked_by` / `locked_at` are a lease, not a lock. Whoever opens a task
-- claims it; anybody else sees it read-only. The lease expires on its own after
-- a minute, because the alternative is a task locked forever by somebody who
-- shut their laptop.
--
-- `last_editor` survives the lease ending, so you can always see whose change
-- you are looking at.
-- ---------------------------------------------------------------------------
alter table items add column if not exists description text;
alter table items add column if not exists conclusion  text;
alter table items add column if not exists last_editor uuid references users (id) on delete set null;
alter table items add column if not exists locked_by   uuid references users (id) on delete set null;
alter table items add column if not exists locked_at   timestamptz;

create index if not exists items_locked_at_idx on items (locked_at);

-- Categories are replaced by domains. Anything already filed under one becomes
-- a domain tag where the meaning carries over, and the column then goes.
insert into item_domains (item_id, domain)
select id,
       case category
         when 'licence'   then 'finance'
         when 'permit'    then 'finance'
         when 'location'  then 'brand'
         when 'fitout'    then 'kitchen'
         when 'equipment' then 'kitchen'
         when 'supplier'  then 'kitchen'
         when 'marketing' then 'marketing'
         else 'brand'
       end
from items
on conflict do nothing;

alter table items drop column if exists category;

-- ---------------------------------------------------------------------------
-- Lock everything down. No policies, as everywhere else in this collection.
-- ---------------------------------------------------------------------------
alter table domains      enable row level security;
alter table item_domains enable row level security;
alter table subtasks     enable row level security;
