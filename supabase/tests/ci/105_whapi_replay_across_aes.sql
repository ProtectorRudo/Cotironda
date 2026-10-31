-- D034: prueba adversarial PostgreSQL17 efímera; todas las filas ROLLBACK.
begin;
grant usage on schema ci_helpers to cotironda_whapi_gateway;
grant execute on function ci_helpers.assert_true(boolean,text) to cotironda_whapi_gateway;

create function pg_temp.reject_d034(q text, expected text)
returns void language plpgsql as $f$
declare s text; failed boolean:=false;
begin
 begin execute q;
 exception when others then
   get stacked diagnostics s=message_text;
   if s<>expected then raise exception 'unexpected_failure expected=% got=%',expected,s;end if;
   failed:=true;
 end;
 if not failed then raise exception 'unexpected_success_%',expected;end if;
end;$f$;

insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0000-4000-8000-000000000701','Buyer D034 CI','buyer'),
 ('bbbbbbbb-0000-4000-8000-000000000702','Supplier D034 CI','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
values ('bbbbbbbb-0000-4000-8000-000000000702','Hardware store D034',true);
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
values ('dddddddd-0000-4000-8000-000000000704',
 'aaaaaaaa-0000-4000-8000-000000000701',
 now()-interval '1 minute',now()+interval '1 hour');
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit)
values ('dddddddd-0000-4000-8000-000000000704',1,'cemento_001',10,'bag');
insert into cotironda_private.round_invites_v1
(round_id,supplier_org_id,anon_id,invite_position)
values ('dddddddd-0000-4000-8000-000000000704',
 'bbbbbbbb-0000-4000-8000-000000000702','anon_d034_ci',1);
insert into cotironda_private.whapi_contacts_v1
(channel_id,chat_key,supplier_org_id,verified_at,consented_at)
values ('whapi_ci',repeat('a',64),
 'bbbbbbbb-0000-4000-8000-000000000702',
 now()-interval '1 day',now()-interval '1 day');
update cotironda_private.rounds_v1 set status='abierta'
where id='dddddddd-0000-4000-8000-000000000704';

set local role cotironda_whapi_gateway;
select ci_helpers.assert_true(
 cotironda_private.whapi_inbox_record_keyed_v1(
 'whapi_ci',repeat('a',64),repeat('b',64),repeat('c',64),'text',
 decode(repeat('44',33),'hex'),decode(repeat('11',12),'hex'),
 decode(repeat('22',16),'hex'),1800000000,'aes_2026_a')
 = '{"estado":"entrada_persistida","repetido":false}'::jsonb,
 'first_key_a_save');

-- El mensaje idéntico reenviado después de la rotación usa key-id B y
-- ciphertext/nonce/tag NUEVOS. Debe ser repetido, nunca grabar segunda fila.
select ci_helpers.assert_true(
 cotironda_private.whapi_inbox_record_keyed_v1(
 'whapi_ci',repeat('a',64),repeat('b',64),repeat('c',64),'text',
 decode(repeat('55',33),'hex'),decode(repeat('99',12),'hex'),
 decode(repeat('88',16),'hex'),1800000000,'aes_2026_b')
 = '{"estado":"entrada_persistida","repetido":true}'::jsonb,
 'rotated_aes_same_event_idempotent');

-- La ruta legacy sigue reconociendo un replay de la fila keyed; mismo HMAC.
select ci_helpers.assert_true(
 cotironda_private.whapi_inbox_record_v1(
 'whapi_ci',repeat('a',64),repeat('b',64),repeat('c',64),'text',
 decode(repeat('55',33),'hex'),decode(repeat('99',12),'hex'),
 decode(repeat('88',16),'hex'),1800000000)
 = '{"estado":"entrada_persistida","repetido":true}'::jsonb,
 'legacy_path_replay_keyed');

-- Un mensaje nuevo con key-id B se guarda normalmente.
select ci_helpers.assert_true(
 cotironda_private.whapi_inbox_record_keyed_v1(
 'whapi_ci',repeat('a',64),repeat('d',64),repeat('e',64),'text',
 decode(repeat('66',45),'hex'),decode(repeat('77',12),'hex'),
 decode(repeat('22',16),'hex'),1800000001,'aes_2026_b')
 = '{"estado":"entrada_persistida","repetido":false}'::jsonb,
 'new_message_after_rotation');

-- Cambios de contenido, timestamp o tipo NO son reenvíos idénticos.
do $bad$
declare sql text;expected text:='keyed_inbox_event_collision';msg text;
begin
 foreach sql in array ARRAY[
  format('select cotironda_private.whapi_inbox_record_keyed_v1(''whapi_ci'',repeat(''a'',64),repeat(''b'',64),repeat(''f'',64),''text'',decode(repeat(''55'',33),''hex''),decode(repeat(''99'',12),''hex''),decode(repeat(''88'',16),''hex''),1800000000,''aes_2026_b'')'),
  format('select cotironda_private.whapi_inbox_record_keyed_v1(''whapi_ci'',repeat(''a'',64),repeat(''b'',64),repeat(''c'',64),''text'',decode(repeat(''55'',33),''hex''),decode(repeat(''99'',12),''hex''),decode(repeat(''88'',16),''hex''),1800000002,''aes_2026_b'')'),
  format('select cotironda_private.whapi_inbox_record_keyed_v1(''whapi_ci'',repeat(''a'',64),repeat(''b'',64),repeat(''c'',64),''image'',decode(repeat(''55'',33),''hex''),decode(repeat(''99'',12),''hex''),decode(repeat(''88'',16),''hex''),1800000000,''aes_2026_b'')')
 ] loop
  begin execute sql;
  exception when unique_violation then
    get stacked diagnostics msg=message_text;
    if msg=expected then continue;end if;
  end;
  raise exception 'D034_collision_not_rejected';
 end loop;
end;$bad$;
reset role;

select ci_helpers.assert_true(
 (select count(*)=2 from cotironda_private.whapi_inbox_v1
  where channel_id='whapi_ci' and kind='text'),'no_duplicates');
select ci_helpers.assert_true(
 (select crypto_key_id='aes_2026_a'
  and payload_ciphertext=decode(repeat('44',33),'hex')
  and payload_nonce=decode(repeat('11',12),'hex')
  and payload_tag=decode(repeat('22',16),'hex')
  from cotironda_private.whapi_inbox_v1
  where channel_id='whapi_ci' and message_key=repeat('b',64)),
  'historic_cipher_and_key_immutable');

-- Al cerrar ronda, un reenvío registrado se reconoce, pero jamás se agrega
-- una oferta nueva. Un cambio de precio no puede colarse tras cierre.
update cotironda_private.rounds_v1 set status='cancelada'
where id='dddddddd-0000-4000-8000-000000000704';
set local role cotironda_whapi_gateway;
select ci_helpers.assert_true(
 cotironda_private.whapi_inbox_record_keyed_v1(
 'whapi_ci',repeat('a',64),repeat('b',64),repeat('c',64),'text',
 decode(repeat('55',33),'hex'),decode(repeat('99',12),'hex'),
 decode(repeat('88',16),'hex'),1800000000,'aes_2026_b')
 = '{"estado":"entrada_persistida","repetido":true}'::jsonb,
 'replay_after_round_closed');
reset role;
rollback;
do $verify$ begin
 if exists(select 1 from cotironda_private.whapi_inbox_v1
 where channel_id='whapi_ci' and message_key=repeat('b',64))
 then raise exception 'D034_fixture_not_rolled_back';end if;
end;$verify$;
