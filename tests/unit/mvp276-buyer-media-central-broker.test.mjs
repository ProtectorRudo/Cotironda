import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {procesarDocumentoCompradorCentralMvp276}
 from '../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-media-mvp276.ts';

const H='e'.repeat(64),C='f'.repeat(64);
const original='Pedido de materiales\n20 bolsas Cemento CPC 50 kg\n'+
 '15 m Cable unipolar 2,5 mm2\nEntrega en La Plata';
const enc=x=>new TextEncoder().encode(x);
const sha=x=>createHash('sha256').update(x).digest('hex');
const file={mime:'text/plain',bytes:enc(original),
 sha256:sha(enc(original))};
const proposal={
 status:'review_required',kind:'buyer_request',
 delivery_city:'La Plata',requested_delivery_note:null,
 total_declared:null,unanswered:[],lines:[
  {original_description:'Cemento CPC 50 kg',quantity:'20',unit:'bolsas',
   unit_price:null,line_total:null,evidence_location:'linea 2',ambiguity:null},
  {original_description:'Cable unipolar 2,5 mm2',quantity:'15',unit:'m',
   unit_price:null,line_total:null,evidence_location:'linea 3',ambiguity:null}
 ]
};
const plan={
 estado:'plan_validado_sin_envio',motivo:'readonly',
 pedido:{zona_entrega:'La Plata',articulos:[{descripcion:'Cemento CPC 50 kg'}]},
 ruteo:{estado:'ruteo_valido_para_preparacion',propuestas:[{}]},
 catalogos:[],whatsappEnviado:false,baseModificada:false
};
function run(changes={}){
 const calls=[];
 const opts={
  habilitado:true,publicar:false,
  autenticadoPorWebhook:true,compradorAutorizado:true,
  chatHmac:C,messageHmac:H,original:file,
  primera:proposal,segunda:structuredClone(proposal),
  apiKey:'SYNTHETIC_NEVER_REAL_KEY',model:'gpt-6-luna',
  rpc:async(name,params)=>{
   calls.push('rpc:'+name);
   if(name!=='cotironda_piloto_ia_catalogo_mvp220')
    throw Error('Only mocked SQL broker may write');
   return {data:{},error:null};
  },
  planificar:async args=>{
   calls.push('planner');
   // Must be the exact original bytes, never an AI rewritten document.
   assert.equal(args.textoOriginal,original);
   return plan;
  },
  procesar:async args=>{
   calls.push('broker');
   assert.equal(args.fuente,original);
   assert.equal(args.sourceSha256,file.sha256);
   assert.equal(args.chatHmac,C);
   assert.equal(args.messageHmac,H);
   assert.equal(args.publicar,false);
   const reused=await args.planificar({
    textoOriginal:original,chatHmac:C,messageHmac:H,
    autenticadoPorWebhook:true
   });
   assert.equal(reused,plan);
   return {
    estado:'ronda_en_sombra',codigo:'publish_flag_disabled',
    requestId:'00000000-0000-4000-8000-000000000001',
    seguimientoHabilitado:false,whatsappEnviado:false
   };
  },...changes
 };
 return {calls,execute:()=>procesarDocumentoCompradorCentralMvp276(opts)};
}
const noSends=r=>{
 assert.equal(r.whatsappEnviado,false);
 assert.equal(r.contactosRevelados,false);
};
test('MVP276: TXT original and one semantic plan reused by broker (no duplicate AI)',async()=>{
 const {execute,calls}=run();
 const r=await execute();
 assert.equal(r.estado,'ronda_en_sombra');
 assert.equal(r.origenArchivadoValidado,true);
 assert.equal(r.rondaPublicada,false);
 noSends(r);
 assert.deepEqual(calls,['planner','broker']);
});
test('MVP276: publication claimed only after SQL broker explicitly prepared round',async()=>{
 const {execute,calls}=run({
  publicar:true,
  procesar:async args=>{
   calls.push('broker');
   assert.equal(args.publicar,true);
   return {
    estado:'ronda_publicada',codigo:'ready_for_supplier_dispatch',
    requestId:'00000000-0000-4000-8000-000000000001',
    seguimientoHabilitado:true,whatsappEnviado:false
   };
  }
 });
 const r=await execute();
 assert.equal(r.estado,'ronda_publicada');
 assert.equal(r.rondaPublicada,true);
 noSends(r);
 assert.deepEqual(calls,['planner','broker']);
});
test('MVP276: OFF flag blocks all model calls and all SQL actions',async()=>{
 const {execute,calls}=run({habilitado:false});
 const r=await execute();
 assert.equal(r.estado,'apagado');
 noSends(r);
 assert.deepEqual(calls,[]);
});
test('MVP276: missing independent source bytes, conflicting document, wrong buyer are denied',async()=>{
 for(const ch of [
  {original:{...file,sha256:'0'.repeat(64)}},
  {original:{...file,mime:'application/pdf'}},
  {segunda:{...proposal,delivery_city:'Berisso'}},
  {compradorAutorizado:false},
  {chatHmac:'not-a-hash'}
 ]){
  const {execute,calls}=run(ch);
  const r=await execute();
  assert.equal(r.estado,'requiere_revision');
  assert.equal(r.rondaPublicada,false);
  noSends(r);
  assert.deepEqual(calls,[]);
 }
});
test('MVP276: broker failure is not retried and cannot masquerade as success',async()=>{
 let attempts=0;
 const {execute,calls}=run({procesar:async()=>{
  attempts++;throw Error('SQL may have committed: do not retry');
 }});
 const r=await execute();
 assert.equal(r.estado,'conciliacion_requerida');
 assert.equal(attempts,1);
 noSends(r);
 assert.deepEqual(calls,['planner']);
});
test('MVP276: broker cannot rebind verified plan to another source HMAC',async()=>{
 const {execute,calls}=run({
  procesar:async args=>{
   calls.push('broker');
   await args.planificar({
    textoOriginal:original,chatHmac:C,messageHmac:'0'.repeat(64),
    autenticadoPorWebhook:true
   });
   return {estado:'ronda_publicada',whatsappEnviado:false};
  }
 });
 const r=await execute();
 assert.equal(r.estado,'conciliacion_requerida');
 noSends(r);
 assert.deepEqual(calls,['planner','broker']);
});
test('MVP276: distinct OFF flags for staging vs sending, no legacy double preparation',()=>{
 const code=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 const start=code.indexOf("if(proposal.kind==='buyer_request'&&!verifiedSupplier){");
 const end=code.indexOf("}else if(proposal.kind==='supplier_quote'){",start);
 assert.ok(start>0&&end>start);
 const branch=code.slice(start,end);
 assert.match(branch,/COTIRONDA_PILOT_BUYER_DOCUMENT_CENTRAL_ACTIVE_ENABLED/u);
 assert.match(branch,/publicar:false, \/\/ MVP280: uniform review for TXT\/CSV/u);
 assert.match(branch,/procesarDocumentoCompradorCentralMvp276\(/u);
 assert.match(branch,/buyer_review_bypassed_by_document_broker/u);
 assert.match(branch,/COTIRONDA_PILOT_BUYER_DOCUMENT_CENTRAL_PREVIEW_ENABLED/u);
 assert.match(branch,/\}else\{\s*const plan=await db\.rpc\('cotironda_piloto_plan_document_mvp098'/u);
});
