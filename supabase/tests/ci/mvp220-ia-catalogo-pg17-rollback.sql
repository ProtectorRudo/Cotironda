-- CI PostgreSQL17 real, tablas sintéticas y TODO ROLLBACK.
BEGIN;
DO $bootstrap$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  CREATE ROLE anon NOLOGIN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  CREATE ROLE authenticated NOLOGIN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  CREATE ROLE service_role NOLOGIN;
 END IF;
END $bootstrap$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.participants(
 key text primary key,
 participant_role text not null,
 delivery_city text,
 chat_hmac text,
 consent_at timestamptz,
 opted_out_at timestamptz,
 catalogue_confirmed_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.catalogue_lines(
 participant_key text not null references cotironda_piloto_privado.participants(key),
 line_no smallint not null,
 literal_description text not null,
 family_code text,
 recognition_state text not null,
 primary key(participant_key,line_no)
);
ALTER TABLE cotironda_piloto_privado.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.catalogue_lines ENABLE ROW LEVEL SECURITY;
INSERT INTO cotironda_piloto_privado.participants
 (key,participant_role,delivery_city,chat_hmac,consent_at,opted_out_at,catalogue_confirmed_at)
VALUES
 ('arquitecto','buyer',null,repeat('a',64),now(),null,null),
 ('corralon_ailin','supplier','La Plata',repeat('b',64),now(),null,now()),
 ('corralon_nahuel','supplier','la plata',repeat('c',64),now(),null,null),
 ('revocado','supplier','La Plata',repeat('d',64),now(),now(),now());
INSERT INTO cotironda_piloto_privado.catalogue_lines
 (participant_key,line_no,literal_description,family_code,recognition_state)
VALUES
 ('corralon_ailin',1,'Cemento en bolsa','cemento_gris_obra','curated_family'),
 ('corralon_ailin',2,'Bolsón de áridos',null,'pending_review'),
 ('corralon_nahuel',1,'Arena en bigbag',null,'pending_review'),
 ('revocado',1,'Producto oculto','cemento_gris_obra','curated_family');
\ir ../../piloto/mvp220_ia_catalogo_por_rubro_privado.sql
DO $tests$
DECLARE
 r jsonb; n int;
BEGIN
 r:=public.cotironda_piloto_ia_catalogo_mvp220(repeat('a',64),'La Plata');
 IF r->>'state'<>'catalogue_snapshot'
 OR jsonb_array_length(r->'proveedores')<>2
 OR (r->>'proveedoresSinConfirmar')::int<>1
 THEN RAISE EXCEPTION 'mvp220_proveedores_incompletos'; END IF;
 SELECT sum(jsonb_array_length(s->'articulos')) INTO n
 FROM jsonb_array_elements(r->'proveedores') s;
 IF n<>3 THEN RAISE EXCEPTION 'mvp220_items_omitidos'; END IF;
 IF r::text LIKE '%Producto oculto%' OR r::text LIKE '%revocado%'
 THEN RAISE EXCEPTION 'mvp220_filtro_revocacion_fallo'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(r->'proveedores') s
  WHERE s->>'clave'='corralon_nahuel' AND s->>'catalogoConfirmado'='false'
 ) THEN RAISE EXCEPTION 'mvp220_invento_confirmacion'; END IF;
 IF public.cotironda_piloto_ia_catalogo_mvp220(repeat('e',64),'La Plata')->>'state'
 <> 'not_authorized' THEN RAISE EXCEPTION 'mvp220_hmac_ajeno'; END IF;
 IF public.cotironda_piloto_ia_catalogo_mvp220('INVALID','La Plata')->>'state'
 <> 'invalid_input' THEN RAISE EXCEPTION 'mvp220_hmac_invalido'; END IF;
 IF has_function_privilege('anon','public.cotironda_piloto_ia_catalogo_mvp220(text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_ia_catalogo_mvp220(text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.cotironda_piloto_ia_catalogo_mvp220(text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp220_acl_roto'; END IF;
END $tests$;

-- No truncamiento: 151 lineas del mismo negocio no devuelve un top 150.
INSERT INTO cotironda_piloto_privado.catalogue_lines
 (participant_key,line_no,literal_description,family_code,recognition_state)
SELECT 'corralon_ailin',n::smallint,'Material de prueba '||n,
 null,'pending_review' FROM generate_series(3,151) n;
DO $capacity$
BEGIN
 IF public.cotironda_piloto_ia_catalogo_mvp220(repeat('a',64),'La Plata')->>'state'
 <> 'too_many_catalogue_lines'
 THEN RAISE EXCEPTION 'mvp220_truncamiento_permitido';END IF;
END $capacity$;
ROLLBACK;
