-- D020 DEV: pg_net recién instalado, sin jobs/requests/dependencias externas (verificado).
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;