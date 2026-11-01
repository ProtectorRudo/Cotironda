-- Cotironda MVP-072: piloto aislado, SIN cambios en DEV ni producción.
-- Fuente de verdad GitHub. No contiene teléfonos, claves, consentimiento ni precios reales.
-- La cuenta administradora de Supabase aplica este SQL solo en la ref
-- ilggkalaafhtiysyzlmg; nunca ejecutar en qkercsoqhehbenbbncwk.
-- Esquema privado, sin permisos a API pública/roles web ni service_role.
-- WhatsApp/cron/despacho/desbloqueo comercial permanecen apagados.
create schema cotironda_piloto_privado;
revoke all on schema cotironda_piloto_privado
  from public, anon, authenticated, service_role;

create table cotironda_piloto_privado.participants (
 key text primary key check (key in ('arquitecto','corralon_ailin','corralon_nahuel')),
 display_label text not null check (length(display_label) between 3 and 80),
 participant_role text not null check (participant_role in ('buyer','supplier')),
 delivery_city text check (length(delivery_city) between 3 and 80),
 -- HMAC de contacto futuro, nunca teléfono en claro. No completar sin opt-in autenticado.
 chat_hmac text unique check (chat_hmac ~ '^[a-f0-9]{64}$'),
 consent_at timestamptz,
 catalogue_confirmed_at timestamptz,
 created_at timestamptz not null default now(),
 check ((key='arquitecto' and participant_role='buyer' and delivery_city is null)
    or (key<>'arquitecto' and participant_role='supplier' and delivery_city is not null)),
 check (consent_at is null or chat_hmac is not null)
);
create table cotironda_piloto_privado.catalogue_lines (
 participant_key text not null references cotironda_piloto_privado.participants(key) on delete restrict,
 line_no smallint not null check (line_no between 1 and 500),
 literal_description text not null check (char_length(literal_description) between 2 and 250),
 family_code text check (family_code ~ '^[a-z][a-z0-9_]{2,49}$'),
 recognition_state text not null check (recognition_state in ('curated_family','pending_review')),
 created_at timestamptz not null default now(),
 primary key(participant_key,line_no),
 check ((family_code is null and recognition_state='pending_review')
     or (family_code is not null and recognition_state='curated_family'))
);
create index catalogue_lines_families_mvp072
 on cotironda_piloto_privado.catalogue_lines(family_code,participant_key)
 where family_code is not null;

create table cotironda_piloto_privado.requests (
 id uuid primary key default gen_random_uuid(),
 buyer_key text not null references cotironda_piloto_privado.participants(key),
 delivery_city text not null check (length(btrim(delivery_city)) between 3 and 80),
 original_request text not null check (char_length(original_request) between 10 and 30000),
 source_hmac text unique check (source_hmac ~ '^[a-f0-9]{64}$'),
 state text not null default 'draft' check (state in ('draft','prepared','cancelled')),
 created_at timestamptz not null default now(),
 check (buyer_key='arquitecto')
);
create table cotironda_piloto_privado.request_lines (
 request_id uuid not null references cotironda_piloto_privado.requests(id) on delete restrict,
 line_no smallint not null check (line_no between 1 and 200),
 original_description text not null check (char_length(original_description) between 3 and 500),
 quantity numeric(18,3) not null check (quantity>0),
 unit text not null check(unit in ('unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack')),
 family_code text check (family_code ~ '^[a-z][a-z0-9_]{2,49}$'),
 primary key(request_id,line_no)
);
-- Vista para diagnóstico de candidatos: coincidencia de familia curada y localidad;
-- NO significa stock confirmado y NO crea envíos.
create view cotironda_piloto_privado.candidate_suppliers
with (security_invoker=true,security_barrier=true) as
 select distinct r.id as request_id, c.participant_key as supplier_key,
  false as whatsapp_sent,
  (p.catalogue_confirmed_at is not null) as catalogue_confirmed
 from cotironda_piloto_privado.requests r
 join cotironda_piloto_privado.request_lines rl on rl.request_id=r.id
 join cotironda_piloto_privado.catalogue_lines c
   on c.family_code=rl.family_code
   and c.recognition_state='curated_family'
 join cotironda_piloto_privado.participants p
   on p.key=c.participant_key and p.participant_role='supplier'
 where r.state='prepared'
   and lower(btrim(r.delivery_city))=lower(btrim(p.delivery_city));

create table cotironda_piloto_privado.invitations (
 request_id uuid not null references cotironda_piloto_privado.requests(id) on delete restrict,
 supplier_key text not null references cotironda_piloto_privado.participants(key) on delete restrict,
 state text not null default 'prepared' check(state in ('prepared','cancelled')),
 -- A propósito no existe estado 'sent' hasta un adaptador WhatsApp auditado.
 created_at timestamptz not null default now(),
 primary key(request_id,supplier_key)
);
create table cotironda_piloto_privado.offer_versions (
 request_id uuid not null,
 supplier_key text not null,
 revision_no smallint not null check(revision_no between 1 and 100),
 source_message_hmac text not null check(source_message_hmac ~ '^[a-f0-9]{64}$'),
 -- Texto literalmente recibido, jamás normalizar/pisar con una nueva versión.
 original_quote text not null check(char_length(original_quote) between 1 and 150000),
 created_at timestamptz not null default now(),
 primary key(request_id,supplier_key,revision_no),
 unique(supplier_key,source_message_hmac),
 foreign key (request_id,supplier_key)
  references cotironda_piloto_privado.invitations(request_id,supplier_key) on delete restrict
);
create function cotironda_piloto_privado.reject_quote_mutation()
 returns trigger language plpgsql security invoker set search_path='' as $$
begin
 raise exception 'original_quote_immutable';
end $$;
create trigger protect_original_quote
 before update or delete on cotironda_piloto_privado.offer_versions
 for each row execute function cotironda_piloto_privado.reject_quote_mutation();

create table cotironda_piloto_privado.integration_flags (
 only_row boolean primary key default true check(only_row=true),
 whatsapp_inbound_enabled boolean not null default false check(whatsapp_inbound_enabled=false),
 whatsapp_outbound_enabled boolean not null default false check(whatsapp_outbound_enabled=false),
 updated_at timestamptz not null default now()
);
insert into cotironda_piloto_privado.integration_flags(only_row) values(true);

-- Sin políticas públicas: cerrado incluso con un JWT autenticado.
-- Tampoco conceder EXECUTE sobre funciones en esquema no expuesto.
alter table cotironda_piloto_privado.participants enable row level security;
alter table cotironda_piloto_privado.catalogue_lines enable row level security;
alter table cotironda_piloto_privado.requests enable row level security;
alter table cotironda_piloto_privado.request_lines enable row level security;
alter table cotironda_piloto_privado.invitations enable row level security;
alter table cotironda_piloto_privado.offer_versions enable row level security;
alter table cotironda_piloto_privado.integration_flags enable row level security;
revoke all on all tables in schema cotironda_piloto_privado
 from public,anon,authenticated,service_role;
revoke all on all functions in schema cotironda_piloto_privado
 from public,anon,authenticated,service_role;

-- Datos ficticios de prueba con 51 renglones idénticos por comercio.
-- No declarar stock, precios, catálogo confirmado ni consentimiento.
insert into cotironda_piloto_privado.participants
(key,display_label,participant_role,delivery_city) values
 ('arquitecto','Arquitecto · prueba','buyer',null),
 ('corralon_ailin','Corralón Ailín · prueba','supplier','La Plata'),
 ('corralon_nahuel','Corralón Nahuel · prueba','supplier','La Plata');
with materials(line_no,literal_description,family_code) as (values
  (1, 'Cemento CPC 50 kg', 'cemento_gris_obra'),
  (2, 'Cemento CPN 50 kg', 'cemento_gris_obra'),
  (3, 'Cemento de obra 25 kg', 'cemento_gris_obra'),
  (4, 'Cal aérea hidratada 25 kg', 'cal_aerea'),
  (5, 'Cal hidráulica 25 kg', 'cal_hidraulica'),
  (6, 'Yeso tradicional 30 kg', 'yeso_obra'),
  (7, 'Hidrófugo Ceresita 1 litro', 'hidrofugo'),
  (8, 'Hidrófugo líquido 4 litros', 'hidrofugo'),
  (9, 'Adhesivo para cerámicos 25 kg', null),
  (10, 'Pastina para juntas 1 kg', 'pastina_juntas'),
  (11, 'Mortero de asiento 30 kg', null),
  (12, 'Revoque grueso premezclado 30 kg', 'revoque_grueso'),
  (13, 'Revoque fino premezclado 30 kg', 'revoque_fino'),
  (14, 'Arena fina a granel', 'arena_fina'),
  (15, 'Arena gruesa a granel', 'arena_gruesa'),
  (16, 'Piedra partida 6/20 a granel', 'piedra_partida'),
  (17, 'Piedra partida 10/30 a granel', 'piedra_partida'),
  (18, 'Cascote para relleno a granel', 'cascote_relleno'),
  (19, 'Tosca para relleno a granel', 'tosca_relleno'),
  (20, 'Bolsón de arena fina 1 m3', 'arena_fina'),
  (21, 'Bolsón de piedra partida 1 m3', 'piedra_partida'),
  (22, 'Ladrillo común macizo', 'ladrillo_comun'),
  (23, 'Ladrillo hueco 8x18x33 cm', 'ladrillo_hueco'),
  (24, 'Ladrillo hueco 12x18x33 cm', 'ladrillo_hueco'),
  (25, 'Ladrillo hueco 18x18x33 cm', 'ladrillo_hueco'),
  (26, 'Bloque de hormigón 12x19x39 cm', 'bloque_hormigon'),
  (27, 'Bloque de hormigón 19x19x39 cm', 'bloque_hormigon'),
  (28, 'Bloque de hormigón celular HCCA', null),
  (29, 'Ladrillo refractario', null),
  (30, 'Hierro ADN 420 6 mm', 'hierro_adn'),
  (31, 'Hierro ADN 420 8 mm', 'hierro_adn'),
  (32, 'Hierro ADN 420 10 mm', 'hierro_adn'),
  (33, 'Hierro ADN 420 12 mm', 'hierro_adn'),
  (34, 'Hierro ADN 420 16 mm', 'hierro_adn'),
  (35, 'Malla electrosoldada 15x15 4,2 mm', 'malla_electrosoldada'),
  (36, 'Malla electrosoldada 15x15 6 mm', 'malla_electrosoldada'),
  (37, 'Alambre recocido 1 kg', 'alambre_recocido'),
  (38, 'Alambre galvanizado 1 kg', 'alambre_galvanizado'),
  (39, 'Clavos punta París 2 pulgadas', 'clavos_punta_paris'),
  (40, 'Clavos punta París 3 pulgadas', 'clavos_punta_paris'),
  (41, 'Alambre para atar 1 kg', 'alambre_recocido'),
  (42, 'Vigueta pretensada 3 m', 'vigueta_pretensada'),
  (43, 'Vigueta pretensada 4 m', 'vigueta_pretensada'),
  (44, 'Ladrillo de telgopor para losa', null),
  (45, 'Membrana asfáltica aluminizada 4 mm', 'membrana_asfaltica'),
  (46, 'Fieltro asfáltico en rollo', null),
  (47, 'Teja francesa cerámica', 'teja_francesa'),
  (48, 'Bolsón vacío para escombros', null),
  (49, 'Pallet vacío de madera', null),
  (50, 'Balde de albañil 10 litros', null),
  (51, 'Carretilla de obra 90 litros', null)
)
insert into cotironda_piloto_privado.catalogue_lines
 (participant_key,line_no,literal_description,family_code,recognition_state)
select p.key,m.line_no,m.literal_description,m.family_code,
 case when m.family_code is null then 'pending_review' else 'curated_family' end
from materials m
cross join (values ('corralon_ailin'),('corralon_nahuel')) as p(key);

-- Resultado esperado: 3 participantes, 2x51 productos,
-- 41 reconocidos por cada uno, el resto a revisión, 0 teléfonos y 0 mensajes.
