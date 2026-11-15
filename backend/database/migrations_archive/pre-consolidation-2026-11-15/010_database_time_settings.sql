-- Several queries format and compare timestamps in the session time zone, such as
-- to_char(decided_at, 'HH12:MI AM') and the audit log date filters. A new Neon database uses
-- UTC, which would show every one of those times 8 hours early. This matches the settings of
-- the local server: UTC+8 and day-first dates. It applies to connections opened afterwards.
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Manila');
    EXECUTE format('ALTER DATABASE %I SET datestyle TO %L', current_database(), 'ISO, DMY');
END
$$;
