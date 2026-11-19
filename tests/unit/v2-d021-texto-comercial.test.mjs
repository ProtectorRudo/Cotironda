import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {evidenciarTextoComercialV2,procesarTextoComercialV2}
 from '../../supabase/functions/cotironda-piloto-auto-recovery/text-commercial-v2.ts';

const source=[
 '10 bolsas cemento 50 kg a $12.500 por bolsa = $125.000',
 '2 bolsones arena $38.000 c/u = $76.000',
 'Total: $201.000',
 'Flete a convenir'
].join('\n');
const raw=()=>({
 lines:[
  {sourceLine:'10 bolsas cemento 50 kg a $12.500 por bolsa = $125.000',
   description:'bolsas cemento 50 kg',quantity:'10',unit:'bolsas',
   unitPrice:'$12.500',lineTotal:'$125.000',ambiguous:false},
  {sourceLine:'2 bolsones arena $38.000 c/u = $76.000',
   description:'bolsones arena',quantity:'2',unit:'bolsones',
   unitPrice:'$38.000',lineTotal:'$76.000',ambiguous:false}
 ],
 totalLiteral:'$201.000',termsLiteral:'Flete a convenir'
});
test('D021: dos artículos, precios unitarios, totales y flete literales, sin alterar original',()=>{
 const snapshot=evidenciarTextoComercialV2(source,raw(),2);
 assert.ok(snapshot);
 assert.equal(snapshot.totalLiteral,'$201.000');
 assert.equal(snapshot.termsLiteral,'Flete a convenir');
 assert.equal(snapshot.quotedItems.length,2);
 assert.deepEqual(snapshot.quotedItems.map(x=>x.unitPrice),['$12.500','$38.000']);
 assert.deepEqual(snapshot.quotedItems.map(x=>x.lineTotal),['$125.000','$76.000']);
 assert.deepEqual(snapshot.quotedItems.map(x=>x.quantity),['10','2']);
 assert.equal(snapshot.quotedItems[0].ambiguity,null);
 assert.equal(JSON.stringify(snapshot).includes('buyerKey'),false);
});
test('D021: no fabrica total, IVA, flete ni precio cuando el proveedor no declara',()=>{
 const quoted='2 bolsas cemento 50 kg';
 const draft={lines:[{sourceLine:quoted,description:'bolsas cemento 50 kg',
  quantity:'2',unit:'bolsas',unitPrice:null,lineTotal:null,
  ambiguous:false}],totalLiteral:null,termsLiteral:null};
 const result=evidenciarTextoComercialV2(quoted,draft,1);
 assert.ok(result);
 assert.equal(result.totalLiteral,null);
 assert.equal(result.termsLiteral,null);
 assert.equal(result.quotedItems[0].lineTotal,null);
 assert.equal(result.quotedItems[0].unitPrice,null);
});
test('D021: rechaza totales calculados, importes inventados, líneas ajenas y faltantes',()=>{
 const bad=[
  {...raw(),totalLiteral:'$999.999'},
  {...raw(),totalLiteral:'$125.000'},
  {...raw(),lines:[{...raw().lines[0],lineTotal:'$444.444'},raw().lines[1]]},
  {...raw(),lines:[{...raw().lines[0],sourceLine:'material inventado'},raw().lines[1]]},
  {...raw(),lines:raw().lines.slice(0,1)},
  {...raw(),lines:[{...raw().lines[0],description:'llamar al 1123456789'},raw().lines[1]]},
  {...raw(),termsLiteral:'Entregar sin autorización'}
 ];
 for(const draft of bad)
  assert.equal(evidenciarTextoComercialV2(source,draft,2),null,JSON.stringify(draft));
});
test('D021: el importe sin prefijo solo se acepta con contexto monetario literal',()=>{
 const s='cemento bolsa precio 12.500\nTotal: 12.500';
 const valid={
  lines:[{sourceLine:'cemento bolsa precio 12.500',
   description:'cemento bolsa',quantity:null,unit:null,
   unitPrice:'12.500',lineTotal:null,ambiguous:false}],
  totalLiteral:'12.500',termsLiteral:null
 };
 assert.equal(evidenciarTextoComercialV2(s,valid,1)?.totalLiteral,'12.500');
 assert.equal(evidenciarTextoComercialV2('cemento bolsa 12.500',
  {...valid,lines:[{...valid.lines[0],sourceLine:'cemento bolsa 12.500'}],
   totalLiteral:null},1),null);
});
test('D021: un solo procesamiento con SHA, lease y no WhatsApp',async()=>{
 const H='a'.repeat(64),C='b'.repeat(64),S=createHash('sha256').update(source).digest('hex');
 let claimCalls=0,finishCalls=0,readCalls=0,nonceUse='';
 const rpc=async(name,args)=>{
  if(name==='cotironda_piloto_claim_text_commercial_v2'){
   claimCalls++;return {error:null,data:claimCalls===1?{
    state:'claimed',source_hmac:H,chat_hmac:C,source_sha256:S,
    nonce:'secure-nonce',ciphertext:'secure-cipher',expected_items:2
   }:{state:'empty'}};}
  assert.equal(name,'cotironda_piloto_finish_text_commercial_v2');
  assert.equal(args.p_source_hmac,H);
  assert.equal(args.p_source_sha256,S);
  assert.equal(args.p_state,'ready');
  assert.equal(args.p_facts.quotedItems.length,2);
  finishCalls++;return {error:null,data:{state:'recorded'}};
 };
 const args={enabled:true,apiKey:'sk-'+'x'.repeat(36),model:'gpt-6-luna',
  rpc,shaText:async t=>createHash('sha256').update(t).digest('hex'),
  decrypt:async (nonce,cipher,aad)=>{
   assert.equal(nonce,'secure-nonce');assert.equal(cipher,'secure-cipher');
   nonceUse=aad;return source;},
  read:async()=>{readCalls++;return raw();}
 };
 const first=await procesarTextoComercialV2(args);
 assert.deepEqual(first,{state:'ready_private',processed:1,outboundMessages:0});
 assert.equal(nonceUse,C+'|'+H+'|text');
 const second=await procesarTextoComercialV2(args);
 assert.deepEqual(second,{state:'empty',processed:0,outboundMessages:0});
 assert.deepEqual([claimCalls,finishCalls,readCalls],[2,1,1]);
});
test('D021: una lectura inválida queda privada en review, sin reintentar IA',async()=>{
 const H='a'.repeat(64),C='b'.repeat(64),S=createHash('sha256').update(source).digest('hex');
 let readCalls=0,finishState='';
 const rpc=async(name,params)=>{
  if(name==='cotironda_piloto_claim_text_commercial_v2')
   return {error:null,data:{state:'claimed',source_hmac:H,
    source_sha256:S,chat_hmac:C,nonce:'n',ciphertext:'c',expected_items:2}};
  finishState=params.p_state;
  assert.equal(params.p_facts,null);
  return {error:null,data:{state:'recorded'}};
 };
 const r=await procesarTextoComercialV2({
  enabled:true,apiKey:'sk-'+'x'.repeat(36),model:'gpt-6-luna',
  rpc,decrypt:async()=>source,
  shaText:async t=>createHash('sha256').update(t).digest('hex'),
  read:async()=>{readCalls++;return {...raw(),totalLiteral:'$900.000'};}
 });
 assert.deepEqual(r,{state:'review_private',processed:1,outboundMessages:0});
 assert.equal(finishState,'review');assert.equal(readCalls,1);
});
test('D021: el nuevo SQL nunca publica información sin sesión, SHA y consentimiento',()=>{
 const sql=readFileSync(new URL(
  '../../supabase/piloto/v2_d021_texto_comercial_universal_CANDIDATE.sql',
  import.meta.url),'utf8');
 for(const phrase of ['v2_text_commercial_d021',
  'ENABLE ROW LEVEL SECURITY','v2_d016_effective_original_consent_private',
  'p_sesion_hmac','cotironda_piloto_v2_d016_original_source_private',
  "c.source_sha256=v_source->>'sha256'",
  'cotironda_piloto_v2_d016_responders_with_analysis_private',
  'service_role','FOR UPDATE OF l SKIP LOCKED'
 ])assert.ok(sql.includes(phrase),phrase);
 assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION[^\n]*\n\s*TO\s+(?:PUBLIC|anon|authenticated)/giu);
});
test('D021: portal presenta mensaje original privado, sin imagen falsa ni HTML inyectado',()=>{
 const ui=readFileSync(new URL(
  '../../apps/portal/app/piloto/v2/rondas/[rondaId]/whatsapp/respuestas-whatsapp.tsx',
  import.meta.url),'utf8');
 assert.ok(ui.includes('<pre>{originalTexto.text}</pre>'));
 assert.ok(ui.includes("mime?.split(';')[0]!=='text/plain'"));
 assert.ok(ui.includes('originales-whatsapp'));
 assert.ok(!ui.includes('dangerouslySetInnerHTML'));
});

test('D021: datos de contacto literales tampoco pasan a la ficha comercial',()=>{
 const s='cemento 50 kg llamar al 11 1234 5678, precio $20.000';
 const input={lines:[{
  sourceLine:s,description:'cemento 50 kg llamar al 11 1234 5678',
  quantity:null,unit:null,unitPrice:'$20.000',lineTotal:null,ambiguous:false
 }],totalLiteral:null,termsLiteral:null};
 assert.equal(evidenciarTextoComercialV2(s,input,1),null);
});

test('D021: nunca confunde un prefijo de precio o total con el importe original completo',()=>{
 const source='10 bolsas cemento a $105.000\nTotal: $355.000';
 const baseline={
  lines:[{sourceLine:'10 bolsas cemento a $105.000',
   description:'bolsas cemento',quantity:'10',unit:'bolsas',
   unitPrice:null,lineTotal:'$105.000',ambiguous:false}],
  totalLiteral:'$355.000',termsLiteral:null
 };
 assert.equal(evidenciarTextoComercialV2(source,baseline,1)?.totalLiteral,'$355.000');
 assert.equal(evidenciarTextoComercialV2(source,{
  ...baseline,totalLiteral:'$355.00'},1),null,
  'No presentar $355.00 como el TOTAL original $355.000');
 assert.equal(evidenciarTextoComercialV2(source,{
  ...baseline,lines:[{...baseline.lines[0],lineTotal:'$105.00'}]},1),null,
  'No presentar $105.00 como $105.000 del renglón');
});
