BEGIN;
SELECT public.cotironda_piloto_ia_issue_buyer_notice_mvp315(
 :'rid'::uuid,
 (SELECT b.chat_hmac FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.participants b ON b.key=r.buyer_key
 WHERE r.id=:'rid'::uuid),
 (SELECT source_hmac FROM cotironda_piloto_privado.requests WHERE id=:'rid'::uuid),repeat('a',64),'pilotchan_313')->>'state';
DO $hold316$ BEGIN PERFORM pg_sleep(2); END $hold316$;
COMMIT;
