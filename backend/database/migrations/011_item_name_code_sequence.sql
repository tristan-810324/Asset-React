-- Item names get a number inside their category (001, 002, ...). The number is the middle part of the item code:
-- 2026-CPP-001-0001. The counter lives on the category and only goes up, so a deleted name's number is never reused.
BEGIN;

ALTER TABLE public.item_categories
  ADD COLUMN IF NOT EXISTS item_name_sequence INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.item_category_item_names
  ADD COLUMN IF NOT EXISTS code_sequence INTEGER;

-- Existing names keep their order: the oldest name in each category gets 001.
UPDATE public.item_category_item_names AS item_name
   SET code_sequence = ranked.position
  FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY created_at, id) AS position
      FROM public.item_category_item_names
  ) AS ranked
 WHERE item_name.id = ranked.id;

UPDATE public.item_categories AS category
   SET item_name_sequence = COALESCE((
     SELECT MAX(item_name.code_sequence)
       FROM public.item_category_item_names AS item_name
      WHERE item_name.category_id = category.id
   ), 0);

ALTER TABLE public.item_category_item_names
  ALTER COLUMN code_sequence SET NOT NULL;

ALTER TABLE public.item_category_item_names
  ADD CONSTRAINT item_category_item_names_code_sequence_unique UNIQUE (category_id, code_sequence);

-- Runs for every insert, so both the GSO Manage Names screen and the requisition approval get a number.
-- A name that already exists gets 0 and no counter step: the insert then hits the existing unique index
-- (or ON CONFLICT DO NOTHING), so numbers are not skipped.
CREATE OR REPLACE FUNCTION public.assign_item_name_code_sequence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.code_sequence IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.item_category_item_names AS existing
       WHERE existing.category_id = NEW.category_id AND lower(existing.name) = lower(NEW.name)
    ) THEN
      NEW.code_sequence := 0;
    ELSE
      UPDATE public.item_categories
         SET item_name_sequence = item_name_sequence + 1
       WHERE id = NEW.category_id
      RETURNING item_name_sequence INTO NEW.code_sequence;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER item_category_item_names_assign_code_sequence
  BEFORE INSERT ON public.item_category_item_names
  FOR EACH ROW EXECUTE FUNCTION public.assign_item_name_code_sequence();

COMMIT;
