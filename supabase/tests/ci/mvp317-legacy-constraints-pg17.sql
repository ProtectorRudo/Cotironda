-- MVP317. ONLY disposable PostgreSQL17 CI, no real Cotironda data.
-- Mirror the three historical constraint names verified read-only in pilot.
DO $guard317$ BEGIN
 IF current_database()<>'cotironda_ci' THEN
  RAISE EXCEPTION 'mvp317_synthetic_database_only' USING ERRCODE='42501';
 END IF;
END $guard317$;
ALTER TABLE cotironda_piloto_privado.participants
 ADD CONSTRAINT participants_key_check
 CHECK(key IN ('arquitecto','corralon_ailin','corralon_nahuel')) NOT VALID;
ALTER TABLE cotironda_piloto_privado.participants
 ADD CONSTRAINT participants_check
 CHECK((key='arquitecto' AND participant_role='buyer' AND delivery_city IS NULL)
  OR (key<>'arquitecto' AND participant_role='supplier' AND delivery_city IS NOT NULL))
 NOT VALID;
ALTER TABLE cotironda_piloto_privado.requests
 ADD CONSTRAINT requests_buyer_key_check
 CHECK(buyer_key='arquitecto') NOT VALID;
