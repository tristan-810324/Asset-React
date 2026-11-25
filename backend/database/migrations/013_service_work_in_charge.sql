BEGIN;

ALTER TABLE public.service_work_orders
  ADD COLUMN IF NOT EXISTS in_charge_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL;

COMMIT;
