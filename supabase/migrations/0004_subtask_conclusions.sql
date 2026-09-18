-- stride2palette: a line about how each step actually ended.

-- ---------------------------------------------------------------------------
-- subtasks.conclusion
--
-- The same argument as items.conclusion, one level down. A ticked step records
-- that something happened but not what: "לקבל שלוש הצעות מחיר" done tells you
-- nothing three months later, where "הכי זול 14,200 ש״ח מקפה איטליה, כולל שנה
-- אחריות" tells you everything.
--
-- Unlike a task's conclusion this one is NOT required. A task is a decision
-- worth writing up; a step is often a two-minute errand, and there are already
-- a hundred and thirteen of them on this board. Demanding a sentence for every
-- tick would teach people to type a full stop, which is worse than an empty
-- column because it looks like an answer.
-- ---------------------------------------------------------------------------
alter table subtasks add column if not exists conclusion text;
