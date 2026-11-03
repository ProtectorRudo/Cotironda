-- MVP-110: after the server deadline, a buyer with a valid private
-- tracking token may receive ONLY his/her consented finalist contacts.
-- Ciphertext never reaches the browser; Edge decrypts and redacts it.
create function public.cotironda_piloto_tracking_finalists_mvp110(
 p_token_hash text
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r_ record;contacts jsonb;names jsonb;
begin
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
 then return jsonb_build_object('state','not_found');end if;
 select req.id,req.buyer_key,plan.supplier_keys,plan.candidate_count
 into r_ from cotironda_piloto_privado.buyer_tracking_mvp091 t
 join cotironda_piloto_privado.requests req on req.id=t.request_id
 join cotironda_piloto_privado.finalist_activation_mvp113 activation
  on activation.only_row and activation.enabled
   and activation.activated_at<=clock_timestamp()
   and req.created_at>=activation.activated_at
 join cotironda_piloto_privado.participants b on b.key=req.buyer_key
 join cotironda_piloto_privado.finalist_coverage_plans_mvp108 plan
  on plan.request_id=req.id and plan.state in
  ('one_complete_alternative','two_complete_alternatives')
 where t.token_hash=p_token_hash
  and t.revoked_at is null and t.expires_at>clock_timestamp()
  and req.state='closed' and req.closes_at<=clock_timestamp()
  and b.participant_role='buyer' and b.consent_at is not null
  and b.opted_out_at is null and req.buyer_key='arquitecto'
  and req.delivery_city='La Plata';
 if not found then return jsonb_build_object('state','not_ready');end if;
 contacts:=public.cotironda_piloto_finalist_contacts_mvp109(r_.id);
 if contacts->>'state'<>'ready_private' or
   (contacts->>'count')::integer<>r_.candidate_count+1
 then return jsonb_build_object('state','not_ready');end if;
 select jsonb_object_agg(p.key,p.display_label) into names
 from cotironda_piloto_privado.participants p
 where p.key=r_.buyer_key or p.key=any(r_.supplier_keys);
 return jsonb_build_object('state','ready_private',
  'buyer_key',r_.buyer_key,
  'supplier_keys',to_jsonb(r_.supplier_keys),
  'contacts_encrypted',contacts->'contacts_encrypted',
  'labels',names,'price_ranked',false);
end;$fn$;
revoke all on function
 public.cotironda_piloto_tracking_finalists_mvp110(text)
 from public,anon,authenticated;
grant execute on function
 public.cotironda_piloto_tracking_finalists_mvp110(text)
 to service_role;
