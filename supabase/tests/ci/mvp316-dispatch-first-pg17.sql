BEGIN;
SELECT public.cotironda_piloto_ia_claim_mvp314(:'rid'::uuid)->>'state';
DO $hold316$ BEGIN PERFORM pg_sleep(2); END $hold316$;
COMMIT;
