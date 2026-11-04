import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareMessage} from '../../supabase/functions/_shared/cotironda-finalist-notice.ts';

const read=(p)=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const plan=read('supabase/piloto/mvp108_finalists_coverage_safe.sql');
const consent=read('supabase/piloto/mvp109_encrypted_contacts_consents.sql');
const outbox=read('supabase/piloto/mvp110_finalists_whapi_outbox.sql');
const buyer=read('supabase/piloto/mvp110_buyer_finalists_tracking.sql');
const portal=read('supabase/functions/cotironda-piloto-seguimiento/index.ts');
const ui=read('site/seguimiento/app.js');
const smoke=read('supabase/piloto/mvp115_joint_supplier_smoke_rollback.sql');
const complete=read('supabase/piloto/mvp112_roundtrip_e2e_rollback.sql');
const contacts=[
 {key:'arquitecto',role:'buyer',phone:'5492211111111'},
 {key:'corralon_ailin',role:'supplier',phone:'5492212222222'},
 {key:'corralon_nahuel',role:'supplier',phone:'5492213333333'}
];
const auth={
 recipient_key:'arquitecto',buyer_key:'arquitecto',
 supplier_keys:['corralon_ailin','corralon_nahuel'],
 labels:{arquitecto:'Arquitecto',corralon_ailin:'Comercio A',
  corralon_nahuel:'Comercio B'},
 price_ranked:false,joint_supplier_coverage:true
};
test('MVP115: two verified partial suppliers can cover distinct requested articles',()=>{
 assert.match(plan,/two_supplier_combination/);
 assert.match(plan,/count\(distinct line_no\)/);
 assert.match(plan,/unnest\(cover_a\|\|cover_b\)/);
 assert.match(plan,/cardinality\(cover_a\)<req_count/);
 assert.match(plan,/cardinality\(cover_b\)<req_count/);
 assert.match(plan,/matches_count=distinct_req/);
 assert.match(plan,/matches_count=distinct_line/);
 assert.match(plan,/l\.quantity_literal/);
 assert.match(plan,/l\.unit_literal/);
 assert.match(plan,/l\.line_total_literal/);
 assert.match(plan,/price_ranked',false/);
 assert.match(smoke,/two_complementary/);
 assert.match(smoke,/'Arena fina',5,'m3','arena_fina'/);
 assert.match(smoke,/'Cemento CPC 50 kg'/);
 assert.match(smoke,/'two_supplier_combination',2/);
 assert.match(smoke,/rollback;/);
});
test('MVP115: mutual contact and outbox only after full deadline and permission',()=>{
 assert.match(consent,/two_supplier_combination/);
 assert.match(outbox,/two_supplier_combination/);
 assert.match(buyer,/two_supplier_combination/);
 assert.match(outbox,/finalist_activation_mvp113/);
 assert.match(outbox,/cotironda_piloto_finalist_contacts_mvp109/);
 assert.match(outbox,/lease_token/);
 assert.match(buyer,/t\.token_hash=p_token_hash/);
 assert.match(buyer,/req\.state='closed'/);
 assert.match(buyer,/joint_supplier_coverage/);
 assert.match(complete,/mvp115_buyer_joint_coverage_flag_incorrect/);
 assert.match(complete,/mvp115_disclosure_mode_wrong/);
 assert.match(complete,/mvp112_finalist_handoffs_incomplete/);
 assert.match(complete,/mvp112_revocation_not_applied/);
});
test('MVP115: buyer notice cannot claim either partial quote alone is complete',()=>{
 const {to,body}=prepareMessage(auth,contacts);
 assert.equal(to,'5492211111111');
 assert.match(body,/dos negocios/i);
 assert.match(body,/Ninguno cotizó el pedido completo por sí solo/i);
 assert.match(body,/No calculamos un precio total comparable/i);
 assert.match(body,/5492212222222/);
 assert.match(body,/5492213333333/);
 assert.doesNotMatch(body,/ganador|más barato|ganaste/i);
});
test('MVP115: supplier notice does not disclose other supplier phone',()=>{
 const {to,body}=prepareMessage({...auth,recipient_key:'corralon_ailin'},contacts);
 assert.equal(to,'5492212222222');
 assert.match(body,/Tu presupuesto parcial/);
 assert.match(body,/junto con el de otro negocio/);
 assert.match(body,/Contacto del comprador: Arquitecto/);
 assert.match(body,/5492211111111/);
 assert.doesNotMatch(body,/5492213333333/);
 assert.doesNotMatch(body,/ganaste por precio/i);
});
test('MVP115: independently complete alternatives keep their previous message',()=>{
 const {body}=prepareMessage({...auth,joint_supplier_coverage:false},contacts);
 assert.match(body,/alternativa\(s\) completas verificadas/);
 assert.doesNotMatch(body,/Ninguno cotizó el pedido completo/);
 assert.match(portal,/joint_supplier_coverage===true/);
 assert.match(ui,/\.textContent =/);
 assert.doesNotMatch(ui,/\binnerHTML\b/);
});
