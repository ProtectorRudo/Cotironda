import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
 clasificarSecretoWebhookMvp335,prepararCandidatoMvp335
} from '../../scripts/piloto/mvp335-no-confirmation-candidate.mjs';
import {prepararCandidatoMvp333}
 from '../../scripts/piloto/mvp333-connection-check-candidate.mjs';
const source=()=>prepararCandidatoMvp335().source;
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');

test('MVP335: genera sobre la versión exacta v72/v73, no sobre GitHub v70',()=>{
 const old=prepararCandidatoMvp333();
 const now=prepararCandidatoMvp335();
 assert.equal(hash(old.source),now.baseline_sha256);
 assert.equal(now.baseline_sha256,'91481dfd1ec51843346d233dfe654e8f3ce0ef699364424b625fe68d05f24f95');
 assert.equal(hash(now.source),now.candidate_sha256);
 assert.equal(now.file_count,61);
 assert.notEqual(now.candidate_sha256,now.baseline_sha256);
});
test('MVP335: no modificar GitHub ni desplegar al preparar el candidato',()=>{
 const s=prepararCandidatoMvp335();
 assert.equal(s.state,'candidate_only_not_deployed');
 assert.equal(s.database_mutated,false);
 assert.equal(s.whatsapp_messages_sent,0);
 assert.equal(s.production_published,false);
 assert.equal(s.webhook_security_bypassed,false);
});
test('MVP335: se rechaza código base alterado, aunque solo cambie un carácter',()=>{
 let original=prepararCandidatoMvp333().source;
 for(const mutation of [original+' ',original.replace('MVP306','MVP-306'),
  original.replace("COTIRONDA_PILOT_WEBHOOK_SECRET","BAD_SECRET")]){
  assert.throws(()=>prepararCandidatoMvp335({source:mutation}),/baseline_mismatch/u);
 }
});
test('MVP335: el segundo interruptor de env ya NO existe en el paquete',()=>{
 assert.doesNotMatch(source(),/COTIRONDA_PILOT_BUYER_AUTO_RELEASE_MVP306_ENABLED/u);
});
test('MVP335: tampoco existe emisor de mensaje CONFIRMAR COTI en nueva ronda',()=>{
 const s=source();
 assert.doesNotMatch(s,/const delivery=await emitirRevisionCompradorMvp279\(/u);
 assert.doesNotMatch(s,/import \{[^\n]*emitirRevisionCompradorMvp279/u);
 assert.match(s,/const emitirRevisionUnificada=async\(sourceHmac:string\)/u);
});
test('MVP335: preserva procesador de confirmaciones HISTÓRICAS sin crearlas',()=>{
 const s=source();
 assert.match(s,/confirmarPedidoCompradorMvp279/u);
 assert.match(s,/esRespuestaConfirmacionMvp279/u);
 assert.doesNotMatch(s,/emitirRevisionCompradorMvp279/u);
});
test('MVP335: SQL MVP306 sigue siendo el autorizador real, no una variable env',()=>{
 const s=source();
 assert.match(s,/const auto=await liberarPedidoAutomaticoMvp306\(\{/u);
 assert.match(s,/enabled:true,webhookAutenticado:true,compradorVerificado:true/u);
 assert.match(s,/chatHmac:chatHash,sourceHmac/u);
 assert.match(s,/if\(auto.estado==='publicado'&&auto.requestId\)/u);
 assert.match(s,/trialDispatchChats.add\(chatHash\)/u);
 assert.match(s,/buyerLinkRequests.push\(\{mode:'auto'/u);
});
test('MVP335: sin comprador autorizado no invoca auto ni revisión heredada',()=>{
 const s=source(),a=s.indexOf('const emitirRevisionUnificada='),b=s.indexOf('const attachmentNotice=',a);
 assert.ok(a>0&&b>a);
 const block=s.slice(a,b);
 assert.match(block,/if\(!centralConfigured\|\|supplierKnown\|\|centralSupplier\|\|!allowBuyerRelease\)/u);
 assert.match(block,/return true; \/\/ no buyer review fallback/u);
 assert.doesNotMatch(block,/Deno\.env|get\('COTIRONDA_PILOT_BUYER_AUTO_RELEASE|emitirRevisionComprador|messages\/text|CONFIRMAR COTI/u);
});
test('MVP335: fallo incierto obliga conciliación y nunca ejecuta segundo envío',()=>{
 const s=source(),a=s.indexOf('const emitirRevisionUnificada='),b=s.indexOf('const attachmentNotice=',a);
 assert.match(s.slice(a,b),/return auto.estado!=='conciliacion_requerida'/u);
 assert.doesNotMatch(s.slice(a,b),/fetch\(|sendWhapi|despacharSolicitudCentralMvp223/u);
});
test('MVP335: el flujo de documentos y la ciudad reutilizan la decisión automática',()=>{
 const s=source();
 for(const x of ['previous.source_hmac','messageHash']){
  const pattern=new RegExp('emitirRevisionUnificada\\('+x.replace('.','\\.')+'\\)');
  assert.match(s,pattern);
 }
 for(const name of ['procesarDocumentoCompradorCentralMvp276','prepararDocumentoBinarioCompradorMvp278','notificarSeguimientoMvp289'])
  assert.match(s,new RegExp(name));
});
test('MVP335: conserva exactamente la frase de conexión sin falsa revisión',()=>{
 const s=source();
 assert.match(s,/connectivityOnlyMvp333/u);
 assert.match(s,/connectivity_check_recorded/u);
 assert.equal((s.match(/connectivityOnlyMvp333/gu)??[]).length,4);
});
test('MVP335: webhook secret vacío no pasa la validación',()=>{
 for(const x of [undefined,null,0,'',{},[]])
  assert.equal(clasificarSecretoWebhookMvp335(x),'missing');
});
test('MVP335: longitudes inválidas fallan sin autorizar entrada',()=>{
 for(const n of [1,8,16,24,31,257,500])
  assert.equal(clasificarSecretoWebhookMvp335('x'.repeat(n)),'invalid_length');
});
test('MVP335: límite de longitud 32 a 256 conservado',()=>{
 for(const n of [32,33,48,100,256])
  assert.equal(clasificarSecretoWebhookMvp335('x'.repeat(n)),'valid');
});
test('MVP335: sólo diagnóstico categórico, sin registrar valores ni longitudes',()=>{
 const s=source();
 assert.match(s,/webhookSecretState=webhookSecret.length===0\?'missing'/u);
 assert.match(s,/webhookSecret.length<32\|\|webhookSecret.length>256\?'invalid_length':'valid'/u);
 assert.match(s,/console.warn\('cotironda_pilot_webhook_secret_state:',webhookSecretState\)/u);
 assert.match(s,/\.\.\.\(webhookSecretState!=='valid'\?\['webhook_secret'\]:\[\]\)/u);
 assert.doesNotMatch(s,/console\.(?:log|warn|error)\([^\n]*webhookSecret[.](?:length|slice)|console\.(?:log|warn|error)\([^\n]*,webhookSecret\)/u);
});
test('MVP335: mantiene autenticación HMAC de header; sin secreto => 503',()=>{
 const s=source();
 assert.match(s,/const authenticated=equalSecret\(webhookHeader,sec.webhookSecret\)/u);
 assert.match(s,/if\(!sec\)return json\(503,'pilot_not_enabled'\)/u);
 assert.match(s,/const webhookSecret=Deno.env.get\('COTIRONDA_PILOT_WEBHOOK_SECRET'\)/u);
 assert.match(s,/req.headers.get\('x-cotironda-webhook-key'\)/u);
 assert.doesNotMatch(s,/webhookSecret=.{0,30}WHAPI_TOKEN/u);
});
test('MVP335: no se altera SQL de cierre ni permiso de proveedor',()=>{
 const sql=readFileSync(new URL('../../supabase/piloto/mvp306_auto_release_y_contactos_proveedor.sql',import.meta.url),'utf8');
 assert.match(sql,/r.created_at>=gate.activated_at/u);
 assert.match(sql,/fuente_revisable_mvp280\(r.id\)/u);
 assert.match(sql,/proveedores_contactables_mvp306\(v.id\)/u);
});
test('MVP335: no autoriza doble emisión por eliminación del fallback',()=>{
 const s=source(),a=s.indexOf('const emitirRevisionUnificada='),b=s.indexOf('const attachmentNotice=',a);
 const block=s.slice(a,b);
 assert.equal((block.match(/liberarPedidoAutomaticoMvp306\(/gu)??[]).length,1);
 assert.equal((block.match(/buyerLinkRequests.push/gu)??[]).length,1);
 assert.equal((block.match(/emitirRevisionCompradorMvp279/gu)??[]).length,0);
});
test('MVP335: no necesita habilitar workers ni batch para auto release inmediato',()=>{
 const s=source();
 assert.match(s,/maxJobs:2/u);
 assert.match(s,/despacharSolicitudCentralMvp223\(/u);
 assert.match(s,/notificarSeguimientoMvp289\(/u);
});
