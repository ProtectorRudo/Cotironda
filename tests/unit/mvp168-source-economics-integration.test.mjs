import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {leerOriginalPrivadoMvp168} from
 '../../supabase/functions/cotironda-piloto-document-recovery/source-rows-mvp168.ts';
import {auditarOriginalEconomicoMvp168} from
 '../../supabase/functions/cotironda-piloto-document-recovery/source-economics-mvp168.ts';
import {auditStoredSourceFactsMvp163} from
 '../../supabase/functions/cotironda-piloto-document-recovery/source-facts.ts';
import {runRecoveryService} from
 '../../supabase/functions/cotironda-piloto-document-recovery/logic.ts';
import {readFileSync} from 'node:fs';

const HMAC='b'.repeat(64),REQ='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const src=[
 'ITEM CANT DESCRIPCION DSCTO SUBTOTAL',
 '1,00 BIG BAG de Arena $1.000,00 22,4% $776,00',
 '2,00 BIG BAG de Piedra $1.000,00 22,4% $1.552,00',
 '25,00 cemento avellaneda x 25 kg $100,00 22,4% $1.940,00',
 'TOTAL $4.268,00',
 'IVA no informado. Flete a convenir. Pago: transferencia.'
].join('\n')+'\n'+' '.repeat(220);
const bytes=new TextEncoder().encode(src);
const SHA=createHash('sha256').update(bytes).digest('hex');
const original=()=>new Blob([bytes],{type:'text/plain'});
const lineData=[
 ['BIG BAG de Arena','1,00','$1.000,00','$776,00'],
 ['BIG BAG de Piedra','2,00','$1.000,00','$1.552,00'],
 ['cemento avellaneda x 25 kg','25,00','$100,00','$1.940,00']
];
const doc=()=>({
 requestId:REQ,anonId:'anon_private',messageHmac:HMAC,sourceSha256:SHA,
 declaredTotalLiteral:'$4.268,00',
 lineas:lineData.map(([desc,quantity,price,total],i)=>({
  lineNo:i+1,descriptionLiteral:desc+'; Dscto. 22.4%',
  quantityLiteral:quantity,unitLiteral:null,
  unitPriceLiteral:price,lineTotalLiteral:total
 })),
 prueba:{requestId:REQ,messageHmac:HMAC,sourceSha256:SHA,
  version:9,state:'verified',reason:'covered',lineCount:3,
  sumLineCents:'426800',declaredTotalCents:'426800',
  rankingAllowed:false,revisionVigente:true,cotizacionVigente:true}
});
const candidate=()=>({
 state:'candidate',message_hmac:HMAC,source_sha256:SHA,mime:'text/plain',
 size_bytes:bytes.length,doc:doc()
});
const io=({job=candidate(),file=original(),saved=[],outcome='recorded'}={})=>({
 saved,
 lookup:async()=>({data:job,error:null}),
 download:async path=>{
  assert.equal(path,'media/'+HMAC);
  return {data:file,error:null};
 },
 record:async payload=>{
  saved.push(payload);
  return {data:{state:outcome},error:null};
 }
});

test('MVP168: ARCHIVO REAL de TXT descargado + SHA crea descuentos y condiciones privados',async()=>{
 const sdk=io();
 const state=await auditarOriginalEconomicoMvp168(sdk);
 assert.equal(state,'economic_facts_recorded');
 assert.equal(sdk.saved.length,1);
 const p=sdk.saved[0],d=p.p_facts.descuentos,t=p.p_facts.condiciones;
 assert.equal(p.p_state,'source_checked');
 assert.equal(p.p_source_sha256,SHA);
 assert.equal(d.estado,'descuentos_conciliados_sin_iva');
 assert.deepEqual(d.precios.map(x=>x.descuentoPorcentaje),['22.40','22.40','22.40']);
 assert.deepEqual(d.precios.map(x=>x.unitarioComercialTrasDescuento),['776.00','776.00','77.60']);
 assert.deepEqual(d.precios.map(x=>[x.pagina,x.fila]),[[1,2],[1,3],[1,4]]);
 assert.equal(t.iva.estado,'no_informado');
 assert.equal(t.flete.estado,'a_convenir');
 assert.equal(t.flete.importe,null);
 assert.equal(t.pago.estado,'transferencia');
 assert.equal(t.stockCorroborado,false);
 assert.equal(p.p_facts.rankingAllowed,false);
 assert.equal(p.p_facts.sourceImmutabilityPreserved,true);
 const serialized=JSON.stringify(p.p_facts);
 for(const forbidden of [REQ,HMAC,SHA,'avellaneda','BIG BAG','IVA no informado','Flete a convenir'])
  assert.ok(!serialized.includes(forbidden),forbidden);
});
test('MVP168: documento alterado UN BYTE no registra ni interpreta condiciones',async()=>{
 const corrupted=new Uint8Array(bytes);corrupted[21]=88;
 const sdk=io({file:new Blob([corrupted])});
 assert.equal(await auditarOriginalEconomicoMvp168(sdk),'failed');
 assert.equal(sdk.saved.length,0);
});
test('MVP168: talla distinta o mime no admitido se bloquea antes de Storage',async()=>{
 const c=candidate();c.size_bytes+=1;
 const one=io({job:c});assert.equal(await auditarOriginalEconomicoMvp168(one),'failed');
 const other=candidate();other.mime='image/png';
 let downloaded=false;
 const two=io({job:other});two.download=async()=>{downloaded=true;return {data:original(),error:null}};
 assert.equal(await auditarOriginalEconomicoMvp168(two),'failed');
 assert.equal(downloaded,false);
});
test('MVP168: fuente v9 fuera de vigencia jamás llega a descarga',async()=>{
 for(const patch of [
  {revisionVigente:false},{cotizacionVigente:false},
  {version:8},{state:'needs_source_review'},{rankingAllowed:true}
 ]){
  const c=candidate();c.doc.prueba={...c.doc.prueba,...patch};
  let read=false;const sdk=io({job:c});
  sdk.download=async()=>{read=true;return {data:original(),error:null}};
  assert.equal(await auditarOriginalEconomicoMvp168(sdk),'failed',JSON.stringify(patch));
  assert.equal(read,false);
 }
});
test('MVP168: ninguno elegible devuelve none sin tocar el bucket',async()=>{
 const sdk=io({job:{state:'none'}});
 assert.equal(await auditarOriginalEconomicoMvp168(sdk),'none');
 assert.equal(sdk.saved.length,0);
});
test('MVP168: escritura duplicada idempotente no puede publicar ni adjuntar contactos',async()=>{
 const sdk=io({outcome:'already_checked'});
 assert.equal(await auditarOriginalEconomicoMvp168(sdk),'economic_facts_recorded');
 assert.equal(sdk.saved[0].p_facts.rankingAllowed,false);
});
test('MVP168: error de RPC de escritura se propaga sin revelar datos',async()=>{
 const sdk=io({outcome:'not_permitted'});
 assert.equal(await auditarOriginalEconomicoMvp168(sdk),'failed');
});
test('MVP168: un PDF escaneado no se interpreta, retorna unreadable sin datos',async()=>{
 const b=new Blob([new Uint8Array(190).fill(4)]);
 const hash=createHash('sha256').update(new Uint8Array(await b.arrayBuffer())).digest('hex');
 const r=await leerOriginalPrivadoMvp168(b,{
  mime:'application/pdf',sizeBytes:b.size,sourceSha256:hash
 },{
  pdf:async()=>({scanned:true,rows:[]})
 });
 assert.equal(r.estado,'unreadable');
 assert.deepEqual(r.rows,[]);
});
test('MVP168: PDF multipágina respeta pagina y ordinal estable',async()=>{
 const b=new Blob([new Uint8Array(190).fill(5)]);
 const hash=createHash('sha256').update(new Uint8Array(await b.arrayBuffer())).digest('hex');
 const r=await leerOriginalPrivadoMvp168(b,{
  mime:'application/pdf',sizeBytes:b.size,sourceSha256:hash
 },{
  pdf:async()=>({scanned:false,rows:[
   {page:1,text:'fila 1'}, {page:2,text:'fila 2'}]})
 });
 assert.equal(r.estado,'checked');
 assert.deepEqual(r.rows,[
  {page:1,row:1,text:'fila 1'},{page:2,row:2,text:'fila 2'}
 ]);
});
test('MVP168: Excel extrae filas con ubicaciones VIRTUALES, no inventa hoja/celda',async()=>{
 const b=new Blob([new Uint8Array(190).fill(6)]);
 const hash=createHash('sha256').update(new Uint8Array(await b.arrayBuffer())).digest('hex');
 const mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 const r=await leerOriginalPrivadoMvp168(b,{
  mime,sizeBytes:b.size,sourceSha256:hash
 },{
  office:async()=>['1,00 · arena · $100,00','TOTAL · $100,00']
 });
 assert.equal(r.estado,'checked');
 assert.deepEqual(r.rows.map(x=>[x.page,x.row]),[[1,1],[1,2]]);
});
test('MVP168: nuevo lector compartido mantiene operativo MVP163',async()=>{
 const expectedDraft={
  status:'review_required',kind:'supplier_quote',delivery_city:null,
  requested_delivery_note:null,unanswered:[],total_declared:'$4.268,00',
  lines:lineData.map(([desc,q,p,t])=>({
   original_description:desc,quantity:q,unit:null,unit_price:p,
   line_total:t,evidence_location:'Página 1',ambiguity:null
  }))
 };
 const selected={
  state:'candidate',message_hmac:HMAC,source_sha256:SHA,
  mime:'text/plain',size_bytes:bytes.length,line_count:3,proposal:expectedDraft
 };
 let stored=null;
 const result=await auditStoredSourceFactsMvp163({
  lookup:async()=>({data:selected,error:null}),
  download:async()=>({data:original(),error:null}),
  record:async p=>{stored=p;return {data:{state:'recorded'},error:null}}
 });
 assert.equal(result,'facts_recorded');
 assert.equal(stored.p_facts.lines.length,3);
 assert.equal(stored.p_facts.rankingAllowed,false);
});
test('MVP168: recuperador programa paso economico solo después de source facts',async()=>{
 const calls=[];
 const flags={enabled:true,modelKeyAvailable:true,projectMatches:true};
 const common={
  lookup:async()=>({data:{state:'none'},error:null}),
  recover:async()=>{throw Error('should_not_recover')},
  sourceFacts:async()=>{calls.push('source');return 'none'},
  economics:async()=>{calls.push('economics');return 'economic_facts_recorded'}
 };
 const response=await runRecoveryService(new Request('https://example.test',{method:'POST'}),flags,common);
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{state:'economic_facts_recorded'});
 assert.deepEqual(calls,['source','economics']);
});
test('MVP168: fallo de servicio economico no se maquilla como cierre correcto',async()=>{
 const response=await runRecoveryService(
  new Request('https://example.test',{method:'POST'}),
  {enabled:true,modelKeyAvailable:true,projectMatches:true},{
   lookup:async()=>({data:{state:'none'},error:null}),
   recover:async()=>{throw Error('unexpected')},
   economics:async()=> 'failed'
  });
 assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{state:'economic_facts_unavailable'});
});
test('MVP168: lector fuente economic privilegios + opt-in OFF por defecto',()=>{
 const index=readFileSync(new URL('../../supabase/functions/cotironda-piloto-document-recovery/index.ts',import.meta.url),'utf8');
 const sql=readFileSync(new URL('../../supabase/piloto/mvp168_supplier_economic_source_ledger.sql',import.meta.url),'utf8');
 assert.match(index,/COTIRONDA_PILOT_ECONOMIC_FACTS_ENABLED/);
 assert.match(index,/==='true'/);
 assert.match(index,/cotironda_piloto_next_economic_facts_mvp168/);
 assert.match(index,/cotironda_piloto_record_economic_facts_mvp168/);
 assert.match(sql,/supplier_economic_facts_mvp168/);
 assert.match(sql,/enable row level security/i);
 assert.match(sql,/from public,anon,authenticated,service_role/i);
 assert.match(sql,/to service_role/i);
 assert.match(sql,/on conflict\(message_hmac\) do nothing/i);
 assert.match(sql,/verifier_version>9/);
 assert.match(sql,/sourceImmutabilityPreserved/);
 assert.doesNotMatch(sql,/update\s+cotironda_piloto_privado\.supplier_media_quotes|whapi_outbox|finalist_activation_mvp113/i);
});
