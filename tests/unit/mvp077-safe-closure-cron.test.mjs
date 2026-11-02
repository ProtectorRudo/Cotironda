import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/piloto/mvp077_safe_closure_cron.sql',import.meta.url),'utf8');
const smoke=readFileSync(new URL('../../supabase/piloto/mvp077_smoke_rollback.sql',import.meta.url),'utf8');

test('MVP077: scheduler de 5 minutos llama exclusivamente RPC segura de cierre',()=>{
 assert.match(sql,/create extension if not exists pg_cron with schema pg_catalog/);
 assert.match(sql,/'cotironda_piloto_close_due_5min'/);
 assert.match(sql,/'\*\/5 \* \* \* \*'/);
 assert.match(sql,/\$\$select public\.cotironda_piloto_close_due_v1\(25\);\$\$/);
 assert.match(sql,/only_row=true and whatsapp_inbound_enabled=true/);
 assert.match(sql,/whatsapp_outbound_enabled=false/);
});

test('MVP077: no se activa pg_net, red, Whapi ni revelación de contactos',()=>{
 assert.doesNotMatch(sql,/create extension.*pg_net|net\.http_|https?:\/\/gate\.|fetch\(|whapi_outbox|offer_versions|contact_(?:name|phone)|message_body/i);
 assert.doesNotMatch(sql,/cron\.schedule\([\s\S]*?cotironda_piloto_authorize_whapi_v1/);
 assert.match(smoke,/r->>'reveal_performed'<>'false'/);
 assert.match(smoke,/r->>'outbound_messages'<>'0'/);
});

test('MVP077: guarda de entorno impide instalar sin esquema privado, RPC o flags de piloto',()=>{
 assert.match(sql,/to_regclass\('cotironda_piloto_privado\.requests'\) is null/);
 assert.match(sql,/to_regprocedure\('public\.cotironda_piloto_close_due_v1\(integer\)'\) is null/);
 assert.match(sql,/mvp077_wrong_database/);
 assert.match(sql,/mvp077_pilot_must_keep_outbound_off/);
});

test('MVP077: smoke aborta ante duplicados, registra 0 envíos y revierte pruebas ficticias',()=>{
 assert.match(smoke,/^begin;/);
 assert.match(smoke,/rollback;/);
 assert.match(smoke,/mvp077_cron_missing_or_duplicate/);
 assert.match(smoke,/mvp077_double_close/);
 assert.match(smoke,/mvp077_original_changed/);
 assert.match(smoke,/mvp077_quotes_changed/);
 assert.match(smoke,/has_function_privilege\('anon'/);
});

test('MVP077: manual incluye mecanismo de apagado inmediato y monitoreo',()=>{
 assert.match(sql,/cron\.unschedule\('cotironda_piloto_close_due_5min'\)/);
 assert.match(sql,/cron\.job_run_details/);
});
