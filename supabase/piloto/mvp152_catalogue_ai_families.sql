-- MVP152. Private buyer-only lookup of curated, consented supplier families.
-- Returns no names, phones, contact keys, prices, offers or identities.
create or replace function public.cotironda_piloto_curated_families_mvp152(
 p_buyer_chat_hmac text,p_city text default null
) returns jsonb language sql stable security definer set search_path='' as $fn$
 select coalesce((
  select jsonb_agg(family_code order by family_code) from (
   select distinct c.family_code
   from cotironda_piloto_privado.participants b
   join cotironda_piloto_privado.participants s on
     s.participant_role='supplier'
     and s.key in ('corralon_ailin','corralon_nahuel')
     and s.consent_at is not null and s.opted_out_at is null
   join cotironda_piloto_privado.catalogue_lines c on
     c.participant_key=s.key and c.recognition_state='curated_family'
   where b.key='arquitecto' and b.participant_role='buyer'
     and b.chat_hmac=p_buyer_chat_hmac
     and b.consent_at is not null and b.opted_out_at is null
     and (p_city is null or lower(btrim(p_city))=lower(btrim(s.delivery_city)))
  ) curated
 ),'[]'::jsonb);
$fn$;
revoke all on function
 public.cotironda_piloto_curated_families_mvp152(text,text)
 from public,anon,authenticated;
grant execute on function
 public.cotironda_piloto_curated_families_mvp152(text,text)
 to service_role;
