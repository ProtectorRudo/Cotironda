-- Cotironda V2-05 · two next BUSINESS days, 18:00 local AR.
-- DEPLOY CANDIDATE ONLY; not installed without explicit "Publicalo".
-- Older rounds keep their original 3-7 calendar-day deadlines unchanged.
-- Holidays are NEVER guessed: one approved, fully composed annual calendar
-- per destination city is required (national + province + local).
-- Policy defaults to OFF and no existing requests are updated.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.v2_business_calendar (
 locality text NOT NULL CHECK(locality ~ '^[[:alpha:]][[:alpha:] .-]{2,79}$'),
 year integer NOT NULL CHECK (year BETWEEN 2026 AND 2100),
 revision text NOT NULL CHECK (revision ~ '^[a-z0-9_-]{4,50}$'),
 source_note text NOT NULL CHECK(length(source_note) BETWEEN 8 AND 300),
 approved_at timestamptz,
 PRIMARY KEY(locality,year),
 CHECK(locality=lower(btrim(locality)))
);
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.v2_business_holidays (
 locality text NOT NULL,
 day date NOT NULL,
 calendar_year integer NOT NULL CHECK(calendar_year BETWEEN 2026 AND 2100),
 description text NOT NULL CHECK(length(description) BETWEEN 4 AND 200),
 evidence text NOT NULL CHECK(length(evidence) BETWEEN 8 AND 300),
 PRIMARY KEY(locality,day),
 FOREIGN KEY(locality,calendar_year)
 REFERENCES cotironda_piloto_privado.v2_business_calendar(locality,year)
);
-- PostgreSQL requires direct FK columns. The trigger below also asserts
-- calendar_year matches the date, so no year spoofing is possible.
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.v2_holiday_year_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $guard$
BEGIN
 IF NEW.calendar_year IS DISTINCT FROM EXTRACT(YEAR FROM NEW.day)::integer
 THEN RAISE EXCEPTION 'V2 holiday year mismatch';END IF;
 RETURN NEW;
END $guard$;
DROP TRIGGER IF EXISTS v2_holiday_year_guard
 ON cotironda_piloto_privado.v2_business_holidays;
CREATE TRIGGER v2_holiday_year_guard BEFORE INSERT OR UPDATE
 ON cotironda_piloto_privado.v2_business_holidays FOR EACH ROW
 EXECUTE FUNCTION cotironda_piloto_privado.v2_holiday_year_guard();

CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.v2_business_policy(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 activated_at timestamptz,
 CHECK (NOT enabled OR activated_at IS NOT NULL)
);
INSERT INTO cotironda_piloto_privado.v2_business_policy(singleton,enabled)
 VALUES(true,false) ON CONFLICT(singleton) DO NOTHING;

ALTER TABLE cotironda_piloto_privado.v2_business_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.v2_business_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.v2_business_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_business_calendar,
 cotironda_piloto_privado.v2_business_holidays,
 cotironda_piloto_privado.v2_business_policy FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION cotironda_piloto_privado.v2_deadline(
 p_created timestamptz,p_city text
) RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $deadline$
DECLARE
 v_city text:=lower(btrim(p_city));
 v_day date;
 v_count integer:=0;
 v_year integer;
 v_allowed boolean;
BEGIN
 IF p_created IS NULL OR p_city IS NULL
 OR length(v_city) NOT BETWEEN 3 AND 80 OR v_city ~ '[[:cntrl:]]'
 THEN RETURN NULL;END IF;
 v_day:=(p_created AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
 -- Start at NEXT calendar day. Send day is not counted.
 FOR i IN 1..35 LOOP
  v_day:=v_day+1;
  v_year:=EXTRACT(YEAR FROM v_day)::integer;
  SELECT count(*)=1 INTO v_allowed
  FROM cotironda_piloto_privado.v2_business_calendar c
  WHERE c.locality=v_city AND c.year=v_year AND c.approved_at IS NOT NULL;
  IF NOT v_allowed THEN RETURN NULL;END IF;
  IF EXTRACT(ISODOW FROM v_day) NOT IN (6,7)
   AND NOT EXISTS (
    SELECT 1 FROM cotironda_piloto_privado.v2_business_holidays h
    WHERE h.locality=v_city AND h.day=v_day
   )
  THEN
   v_count:=v_count+1;
   IF v_count=2 THEN
    RETURN (v_day::timestamp + interval '18 hours')
     AT TIME ZONE 'America/Argentina/Buenos_Aires';
   END IF;
  END IF;
 END LOOP;
 RETURN NULL;
END $deadline$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.v2_deadline(timestamptz,text)
 FROM PUBLIC,anon,authenticated;
-- Existing normal operations never invoke this until the new timing mode
-- is selected on a new request and policy is explicitly activated.
ALTER TABLE cotironda_piloto_privado.requests
 ADD COLUMN IF NOT EXISTS timing_mode text NOT NULL DEFAULT 'legacy_calendar';
ALTER TABLE cotironda_piloto_privado.requests
 ADD COLUMN IF NOT EXISTS v2_calendar_revision text;

CREATE OR REPLACE FUNCTION cotironda_piloto_privado.v2_set_round_deadline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $trigger$
DECLARE v_limit timestamptz; v_revision text;
BEGIN
 IF NEW.timing_mode='legacy_calendar' THEN
  IF NEW.v2_calendar_revision IS NOT NULL
  THEN RAISE EXCEPTION 'V2 revision on legacy request';END IF;
  RETURN NEW;
 END IF;
 IF NEW.timing_mode<>'business_two_days'
 THEN RAISE EXCEPTION 'unsupported timing mode';END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_business_policy
  WHERE singleton=true AND enabled=true AND activated_at IS NOT NULL
 ) THEN RAISE EXCEPTION 'V2 two business-day policy is OFF';END IF;
 IF NEW.created_at IS NULL OR
  abs(EXTRACT(EPOCH FROM (NEW.created_at-clock_timestamp())))>300
 THEN RAISE EXCEPTION 'V2 created_at not current';END IF;
 v_limit:=cotironda_piloto_privado.v2_deadline(
  NEW.created_at,NEW.delivery_city);
 IF v_limit IS NULL THEN
  RAISE EXCEPTION 'V2 calendar incomplete for destination';END IF;
 SELECT revision INTO v_revision
 FROM cotironda_piloto_privado.v2_business_calendar
 WHERE locality=lower(btrim(NEW.delivery_city))
 AND year=EXTRACT(YEAR FROM (
   v_limit AT TIME ZONE 'America/Argentina/Buenos_Aires'))::integer
 AND approved_at IS NOT NULL;
 IF v_revision IS NULL THEN
  RAISE EXCEPTION 'V2 calendar revision missing'; END IF;
 NEW.round_days:=2; NEW.closes_at:=v_limit;
 NEW.v2_calendar_revision:=v_revision;
 RETURN NEW;
END $trigger$;
CREATE TRIGGER v2_set_round_deadline
 BEFORE INSERT ON cotironda_piloto_privado.requests
 FOR EACH ROW EXECUTE FUNCTION cotironda_piloto_privado.v2_set_round_deadline();
-- The existing MVP076 BEFORE UPDATE guard protects created_at, closes_at,
-- round_days. Add immutability of the mode and calendar proof.
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.v2_mode_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $imm$
BEGIN
 IF NEW.timing_mode IS DISTINCT FROM OLD.timing_mode OR
  NEW.v2_calendar_revision IS DISTINCT FROM OLD.v2_calendar_revision
 THEN RAISE EXCEPTION 'V2 timing immutable';END IF;
 RETURN NEW;
END $imm$;
CREATE TRIGGER v2_mode_immutable
 BEFORE UPDATE ON cotironda_piloto_privado.requests
 FOR EACH ROW EXECUTE FUNCTION cotironda_piloto_privado.v2_mode_immutable();

-- Narrow policy change: preserve the former legacy assertions EXACTLY.
ALTER TABLE cotironda_piloto_privado.requests
 DROP CONSTRAINT requests_round_days_check;
ALTER TABLE cotironda_piloto_privado.requests
 ADD CONSTRAINT requests_round_days_check CHECK (
  (timing_mode='legacy_calendar' AND round_days BETWEEN 3 AND 7
   AND v2_calendar_revision IS NULL)
  OR (timing_mode='business_two_days' AND round_days=2
   AND v2_calendar_revision ~ '^[a-z0-9_-]{4,50}$')
 );
ALTER TABLE cotironda_piloto_privado.requests
 DROP CONSTRAINT requests_exact_duration_check;
ALTER TABLE cotironda_piloto_privado.requests
 ADD CONSTRAINT requests_exact_duration_check CHECK (
  (timing_mode='legacy_calendar' AND
   EXTRACT(EPOCH FROM (closes_at-created_at))=round_days*86400)
  OR (timing_mode='business_two_days' AND closes_at>created_at
   AND (closes_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::time='18:00:00'::time
   AND (closes_at-created_at)<interval '36 days')
 );
-- No release flags switched on. No holiday rows inserted.
