-- MVP-073 / operador PILOTO, SOLO ejecutar dentro del SQL Editor de:
-- https://supabase.com/dashboard/project/ilggkalaafhtiysyzlmg/sql
-- Produce 3 instrucciones COTI ALTA de uso único y validez 60 minutos.
-- NO incluyas códigos reales en GitHub, ChatGPT ni logs. Copiar a cada persona
-- por un canal privado, que debe ENVIARLOS desde su WhatsApp para dar opt-in.
-- Reejecutar invalida inmediatamente todos los códigos anteriores no usados.
with codes as materialized (
 select p.key, replace(gen_random_uuid()::text,'-','') as code
 from cotironda_piloto_privado.participants p
 where p.key in ('arquitecto','corralon_ailin','corralon_nahuel')
   and p.chat_hmac is null and p.consent_at is null
   and p.opted_out_at is null
), inserted as (
 insert into cotironda_piloto_privado.enrollment_codes
  (participant_key,code_hash,created_at,expires_at,consumed_at)
 select c.key,encode(sha256(convert_to(c.code,'UTF8')),'hex'),
        clock_timestamp(),clock_timestamp()+interval '1 hour',null
 from codes c
 on conflict(participant_key) do update
  set code_hash=excluded.code_hash,created_at=excluded.created_at,
      expires_at=excluded.expires_at,consumed_at=null
 returning participant_key
)
select c.key as destinatario,
       'COTI ALTA '||c.code as mensaje_privado_whatsapp,
       '60 minutos, un solo uso' as validez
from codes c join inserted i on i.participant_key=c.key
order by c.key;