-- Historical follow-up migration retained for existing migration ledgers.
-- The application no longer uses service work orders.

BEGIN;

ALTER TABLE service_work_orders
  DROP CONSTRAINT IF EXISTS service_work_orders_service_category_check;
ALTER TABLE service_work_orders
  DROP CONSTRAINT IF EXISTS service_work_orders_category_check;

ALTER TABLE service_work_orders
  ADD CONSTRAINT service_work_orders_category_check CHECK (service_category IN (
    'ELECTRICAL_LIGHTING', 'PLUMBING_WATER', 'FURNITURE_CARPENTRY',
    'BUILDING_REPAIR', 'CLEANING_SANITATION', 'EVENT_SETUP_MOVING',
    'SAFETY_HAZARD', 'COMPUTER_DEVICE', 'NETWORK_CONNECTIVITY',
    'SOFTWARE_ACCESS', 'PERIPHERALS_PRINTING', 'OTHER_GENERAL', 'OTHERS'
  ));

COMMIT;
