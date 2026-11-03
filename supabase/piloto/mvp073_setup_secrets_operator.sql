-- Cotironda / PILOTO — generador de secretos privado para ejecutar UNA sola vez.
-- Ejecutar SOLAMENTE en el SQL Editor de la base ilggkalaafhtiysyzlmg.
-- Copiar cada valor directo en Supabase > Edge Functions > Secrets.
-- NO reenviar, no guardar en GitHub, no pegar en ChatGPT.
-- Repetir esta consulta DESPUÉS de vincular participantes invalidaría sus HMAC.
-- El resultado NO se almacena en SQL; se genera de manera criptográficamente segura.
select 'COTIRONDA_PILOT_WEBHOOK_SECRET' as clave,
       encode(extensions.gen_random_bytes(32),'hex') as valor
union all
select 'COTIRONDA_PILOT_ID_HMAC_HEX' as clave,
       encode(extensions.gen_random_bytes(32),'hex') as valor
union all
select 'COTIRONDA_PILOT_AES_HEX' as clave,
       encode(extensions.gen_random_bytes(32),'hex') as valor;
