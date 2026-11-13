import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {continuarZonaCentralMvp233}
 from '../../supabase/functions/cotironda-piloto-whapi/ai-central-zone-v2-d013.ts';
import {autorizarPropuestasCatalogoV2}
 from '../../src/domain/ia-central/ruteador-catalogos-v2-d013.ts';
import {generarCandidatoV202DesdeLive76}
 from '../../scripts/piloto/v2-live76-candidate.mjs';

const original='20 bolsas cemento Portland 50 kg';
const sourceHash=createHash('sha256').update(original).digest('hex');
const sourceEvidence=original;
const requestId='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const item={descripcion:'Cemento Portland 50 kg',evidencia:sourceEvidence,
 inicio:0,fin:original.length,cantidad:'20',unidad:'bag',rubro:'obra_gruesa',
 presentacion:'50 kg',aclaracion:null};
const pedido={intencion:'cotizar',zona_entrega:'La Plata',articulos:[item],dudas:[]};
const catalogos=[{clave:'ferre_123',consentido:true,activo:true,
 localidades:['La Plata'],articulos:[{numero:1,
  descripcion:'Cemento Portland bolsa 25 kg',rubro:'ferreteria'}]}];
const prop=[{proveedor:'ferre_123',correspondencias:[{
 indicePedido:0,numeroCatalogo:1,tipo:'alternativa_razonable',
 explicacion:'Cemento Portland igual producto y presentacion distinta'
}]}];
const ruteo=autorizarPropuestasCatalogoV2(pedido,catalogos,prop);
assert.equal(ruteo.estado,'ruteo_valido_para_preparacion');
const plan={estado:'plan_validado_sin_envio',motivo:'ruteo_por_catalogo',
 pedido,ruteo,catalogos,whatsappEnviado:false,baseModificada:false};
const base={
 autenticadoPorWebhook:true,chatHmac:'a'.repeat(64),sourceHmac:'b'.repeat(64),
 originalSha256:sourceHash,ciudadConfirmada:'La Plata',
 nonce:'nonce-sintetico',ciphertext:'payload-sintetico',
 apiKey:'sk-test-synthetic',model:'gpt-6-luna',publicar:false,
 decrypt:async()=>original,
 shaText:async text=>createHash('sha256').update(text).digest('hex'),
 planificar:async({textoOriginal})=>{
  assert.equal(textoOriginal,original+'\nLocalidad de entrega: La Plata');
  return plan;
 }
};
function db(){
 const calls=[];
 const rpc=async(name,params)=>{
  calls.push({name,params});
  if(name==='cotironda_piloto_v2_shadow_prepare_d013'){
   assert.equal(params.p_items[0].rubro,'obra_gruesa');
   assert.equal(params.p_destinos[0].correspondencias[0].rubroCatalogo,'ferreteria');
   assert.equal(params.p_destinos[0].correspondencias[0].descripcionCatalogo,
    'Cemento Portland bolsa 25 kg');
   return {error:null,data:{state:'shadow_staged',
    items_staged:1,matches_staged:1,invitations_sent:0,outbox_sent:0}};
  }
  if(name==='cotironda_piloto_ia_lookup_round_mvp226')
   return {error:null,data:{state:'linked',request_id:requestId}};
  if(name==='cotironda_piloto_ia_finish_buyer_mvp226')
   return {error:null,data:{state:'finished'}};
  throw Error('Unexpected RPC: '+name);
 };
 return {calls,rpc};
}
test('V2-23: pedido seguido de localidad conserva ORIGINAL y enruta por producto de otro rubro',async()=>{
 const fake=db();
 const result=await continuarZonaCentralMvp233({...base,rpc:fake.rpc});
 assert.equal(result.estado,'ronda_en_sombra');
 assert.equal(result.sourceHmac,base.sourceHmac);
 assert.equal(result.requestId,requestId);
 assert.deepEqual(fake.calls.map(c=>c.name),[
  'cotironda_piloto_v2_shadow_prepare_d013',
  'cotironda_piloto_ia_lookup_round_mvp226',
  'cotironda_piloto_ia_finish_buyer_mvp226'
 ]);
 assert.equal(fake.calls[0].params.p_original_text,original);
 assert.equal(fake.calls.at(-1).params.p_state,'staged');
 assert.ok(!fake.calls.some(c=>/cotironda_piloto_ia_shadow_prepare_mvp221|publish_mvp222/u.test(c.name)));
});
test('V2-23: SHA original divergente bloquea staging antes de IA',async()=>{
 const fake=db();let plans=0;
 const r=await continuarZonaCentralMvp233({...base,
  shaText:async()=>('c'.repeat(64)),
  planificar:async()=>{plans++;return plan},
  rpc:fake.rpc
 });
 assert.equal(r.estado,'conciliacion_requerida');
 assert.equal(plans,0);
 assert.ok(!fake.calls.some(c=>c.name.includes('shadow_prepare')));
 assert.equal(fake.calls.at(-1)?.params.p_state,'review');
});
test('V2-23: el comprador no puede imponer otra localidad o material inventado',async()=>{
 const fake=db();
 const wrong={...plan,pedido:{...pedido,zona_entrega:'Rosario'}};
 const r=await continuarZonaCentralMvp233({...base,planificar:async()=>wrong,
  rpc:fake.rpc});
 assert.equal(r.estado,'requiere_revision');
 assert.ok(!fake.calls.some(c=>c.name.includes('shadow_prepare')));
 const fake2=db();
 const invented={...plan,pedido:{...pedido,articulos:[
  {...item,evidencia:'otro material inventado'}
 ]}};
 const r2=await continuarZonaCentralMvp233({...base,planificar:async()=>invented,
  rpc:fake2.rpc});
 assert.equal(r2.estado,'requiere_revision');
 assert.ok(!fake2.calls.some(c=>c.name.includes('shadow_prepare')));
});
test('V2-23: sin RPC V2 instalada no reintenta con M221 ni envía WhatsApp',async()=>{
 const fake=db();
 const rpc=async(name,params)=>{
  if(name==='cotironda_piloto_v2_shadow_prepare_d013'){
   fake.calls.push({name,params});
   return {data:null,error:{code:'PGRST202'}};
  }
  return fake.rpc(name,params);
 };
 const r=await continuarZonaCentralMvp233({...base,rpc});
 assert.equal(r.estado,'conciliacion_requerida');
 assert.equal(fake.calls.filter(c=>c.name==='cotironda_piloto_v2_shadow_prepare_d013').length,1);
 assert.ok(!fake.calls.some(c=>/cotironda_piloto_ia_shadow_prepare_mvp221|publish_mvp222/u.test(c.name)));
});
test('V2-23: generador snapshot Whapi v76 usa buyer y continuación V2 sin tocar base',()=>{
 const index=readFileSync(new URL(
  '../../scripts/piloto/baselines/cotironda-whapi-v76.index.ts.txt',
  import.meta.url),'utf8');
 const supplier=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-mvp336.v76-snapshot.ts',
  import.meta.url),'utf8');
 const candidate=generarCandidatoV202DesdeLive76(index,supplier);
 assert.match(candidate,/from '\.\/ai-central-buyer-v2-d013\.ts';/u);
 assert.match(candidate,/from '\.\/ai-central-zone-v2-d013\.ts';/u);
 assert.doesNotMatch(candidate,/from '\.\/ai-central-buyer-mvp226\.ts';/u);
 assert.doesNotMatch(candidate,/from '\.\/ai-central-zone-mvp233\.ts';/u);
 assert.match(index,/from '\.\/ai-central-zone-mvp233\.ts';/u);
 assert.match(index,/from '\.\/ai-central-buyer-mvp226\.ts';/u);
 assert.match(candidate,/connectivityOnlyMvp333/u);
 assert.match(candidate,/processedInboundMvp333/u);
 assert.match(candidate,/webhookSecretState/u);
});
test('V2-23: worker de zona V2 importa solo planificador/puente D013',()=>{
 const src=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-whapi/ai-central-zone-v2-d013.ts',
  import.meta.url),'utf8');
 assert.match(src,/planificador-piloto-v2-d013\.ts/u);
 assert.match(src,/puente-sql-rondas-v2-d013\.ts/u);
 assert.doesNotMatch(src,/from .*planificador-piloto-mvp220\.ts/u);
 assert.doesNotMatch(src,/from .*puente-sql-rondas-mvp221\.ts/u);
});
