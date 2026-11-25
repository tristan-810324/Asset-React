BEGIN;

ALTER TABLE public.service_work_orders
  ADD COLUMN IF NOT EXISTS in_charge_name TEXT CHECK (in_charge_name IS NULL OR length(in_charge_name) <= 200);

UPDATE public.service_work_orders AS work
   SET in_charge_name = member.name
  FROM public.users AS member
 WHERE member.id = work.in_charge_user_id AND work.in_charge_name IS NULL;

ALTER TABLE public.service_work_orders
  DROP COLUMN IF EXISTS in_charge_user_id;

COMMIT;
