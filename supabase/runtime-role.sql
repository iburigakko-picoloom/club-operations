-- Supabase's built-in server connection must be allowed to SET LOCAL ROLE.
-- This does not grant anything to anon/authenticated or expose the private schema.
-- Run only in the dedicated club project, after server/postgres_schema.sql.
GRANT club_runtime TO postgres WITH SET TRUE;
