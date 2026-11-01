import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const f=name=>readFileSync(new URL('../../supabase/piloto/'+name,import.meta.url),'utf8');
const whapi=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
const sql=f('mvp073d_whapi_durable_outbox.sql');
test('MVP073: lo pendiente está en outbox sin reintento de resultado incierto',()=>{
 assert.match(sql,/state in \('pending','leased','api_accepted','uncertain','cancelled'\)/);
 assert.match(sql,/for update of o skip locked limit 1/);
 assert.match(sql,/where o.state='pending'/);
 assert.match(sql,/p\.consent_at is not null/);
 assert.match(sql,/lease_token=p_lease and state='leased'/);
 assert.match(sql,/whatsapp_outbound_enabled=true/);
});
test('MVP073: no teléfonos ni tokens en la fuente; configuración cerrada',()=>{
 assert.match(whapi,/COTIRONDA_PILOT_WHAPI_INBOUND_ENABLED/);
 assert.match(whapi,/COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED/);
 assert.match(whapi,/COTIRONDA_PILOT_WHAPI_TOKEN/);
 assert.match(whapi,/COTIRONDA_PILOT_RECIPIENTS_JSON/);
 assert.match(whapi,/x-cotironda-webhook-key/);
 assert.match(whapi,/equalSecret\(c\.chat_hmac,expected\)/);
 assert.match(whapi,/cotironda_piloto_authorize_whapi_v1/);
 assert.match(whapi,/cotironda_piloto_finish_whapi_v1/);
 assert.match(whapi,/AbortSignal\.timeout/);
 assert.doesNotMatch(whapi,/\b221\d{7}\b/);
});
test('MVP073: SQL smoke transaccional no altera piloto y es versionado',()=>{
 for(const script of ['mvp073_whapi_smoke_rollback.sql','mvp073d_outbox_smoke_rollback.sql']){
  const c=f(script);
  assert.match(c,/^--/);
  assert.match(c,/begin;/);
  assert.match(c,/rollback;/);
  assert.doesNotMatch(c,/commit;/);
 }
});
