import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
const status=readFileSync(new URL('../../supabase/functions/cotironda-piloto-seguimiento/index.ts',import.meta.url),'utf8');
const sql=readFileSync(new URL('../../supabase/piloto/mvp229_piloto_ia_central_control_temporal.sql',import.meta.url),'utf8');

test('MVP229: piloto entra por control transaccional y NO por secretos de ambiente',()=>{
 assert.match(edge,/cotironda_piloto_ia_trial_flags_mvp229/u);
 assert.match(edge,/p_chat_hmac:chatHash/u);
 assert.match(edge,/const trialActive=trial\.state==='active'/u);
 assert.match(edge,/const centralConfigured=sec\.outbound&&trialActive&&trial\.buyer===true/u);
 assert.match(edge,/habilitado:true,publicar:false, \/\/ MVP280: buyer must approve/u);
 assert.match(edge,/liberar:sec\.outbound&&trialActive&&trial\.buyer===true&&\s*trial\.dispatch===true/u);
 assert.match(edge,/COTIRONDA_PILOT_BUYER_REVIEW_RELEASE_ENABLED/u);
 assert.match(edge,/trial\.quote_link===true/u);
 assert.match(edge,/trial\.quote_analysis===true/u);
 assert.doesNotMatch(edge,/COTIRONDA_PILOT_AI_CENTRAL_BUYER_ENABLED/u);
 assert.doesNotMatch(edge,/COTIRONDA_PILOT_AI_CENTRAL_DISPATCH_ENABLED/u);
 assert.doesNotMatch(edge,/COTIRONDA_PILOT_AI_CENTRAL_QUOTE_LINK_ENABLED/u);
 assert.doesNotMatch(edge,/COTIRONDA_PILOT_AI_CENTRAL_QUOTE_ANALYSIS_ENABLED/u);
});
test('MVP229: despacho solo después de publicar ronda buyer, nunca en texto no relacionado',()=>{
 assert.match(edge,/if\(result\.estado==='ronda_en_sombra'&&\s*!await emitirRevisionUnificada\(messageHash\)\)/u);
 assert.match(edge,/if\(decision\.estado==='publicado'\)\{\s*trialDispatchChats\.add\(chatHash\)/u);
 assert.match(edge,/COTIRONDA_PILOT_BUYER_REVIEW_CONFIRM_ENABLED/u);
 assert.match(edge,/trialDispatchChats\.add\(chatHash\)/u);
 assert.match(edge,/if\(sec\.outbound&&trialDispatchChats\.size>0\)/u);
 assert.match(edge,/for\(const signedChat of trialDispatchChats\)/u);
 assert.match(edge,/cotironda_piloto_ia_ready_for_chat_mvp223/u);
 assert.match(edge,/cotironda_piloto_ia_is_supplier_mvp226/u);
});
test('MVP229: expiración automática, allowlist por empresa, ACL y dos puertas de envío',()=>{
 assert.match(sql,/expires_at<=activated_at\+interval '4 hours'/u);
 assert.match(sql,/expires_at>clock_timestamp\(\)/u);
 assert.match(sql,/p\.key='arquitecto'/u);
 assert.match(sql,/p\.key IN\('corralon_ailin','corralon_nahuel'\)/u);
 assert.match(sql,/cotironda_piloto_privado\.ai_dispatch_gate_mvp222/u);
 assert.match(sql,/cotironda_piloto_privado\.ai_central_control_mvp226/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION/u);
 assert.match(sql,/TO service_role/u);
 assert.doesNotMatch(sql,/DROP TABLE|DISABLE ROW LEVEL SECURITY/iu);
});
test('MVP229: vista de precios por rubro persiste hasta cierre/revocación aun tras vencer el ensayo',()=>{
 assert.match(status,/cotironda_piloto_ia_buyer_rubros_mvp227/u);
 assert.doesNotMatch(status,/COTIRONDA_PILOT_AI_CENTRAL_BUYER_VIEW_ENABLED/u);
 assert.match(status,/vistaCotizacionesRubrosMvp227/u);
 assert.match(status,/p_token_hash:digest/u);
});
