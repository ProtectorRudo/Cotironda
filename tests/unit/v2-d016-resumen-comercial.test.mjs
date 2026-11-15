import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resumirOfertaComercialV2}
 from '../../src/server/v2-d016-resumen-comercial.ts';

const input={
 totalLiteral:'$ 355.400',
 requestItems:[
  {line:1,description:'10 bolsas de cemento CPC de 50 kg',quantity:'10.000',unit:'bag'},
  {line:2,description:'1 bolsón de arena fina de 1 m³',quantity:'1.000',unit:'bag'},
  {line:3,description:'1 bolsón de piedra partida de 1 m³',quantity:'1.000',unit:'bag'}
 ],
 quotedItems:[
  {line:1,description:'Cemento Portland compuesto CPC - bolsa de 50 kg',
   quantity:'10',unit:'bolsas',ambiguity:null},
  {line:2,description:'Arena fina - bolsón de 1 m³',
   quantity:'1',unit:'bolsón',ambiguity:null},
  {line:3,description:'Piedra partida - bolsón de 1 m³',
   quantity:'1',unit:'bolsón',ambiguity:null}
 ]
};
const points=[
 {categoria:'iva',evidencia:'IVA: no incluido en este presupuesto de ejemplo.',
  observacion:'IVA: El presupuesto indica que el IVA no está incluido.'},
 {categoria:'flete',evidencia:'Flete hasta La Plata: no incluido; importe a cotizar.',
  observacion:'Entrega: el importe del flete queda pendiente.'},
 {categoria:'plazo',evidencia:'Forma de pago y plazo de entrega: no informados.',
  observacion:'Plazos: sin condiciones informadas.'}
];
test('D016 comprador Ailín: total literal, tres productos completos, cuatro condiciones',()=>{
 const r=resumirOfertaComercialV2(input,points);
 assert.equal(r.totalDeclarado,'$ 355.400');
 assert.deepEqual([r.cobertura?.identificados,r.cobertura?.solicitados],[3,3]);
 assert.deepEqual(r.cobertura?.porVerificar,[]);
 assert.equal(r.cobertura?.adicionales,0);
 assert.deepEqual(r.condiciones,{
  iva:'No incluido',flete:'No incluido · a cotizar',
  pago:'No informado',entrega:'No informado'
 });
});
test('D016 no considera 5 bolsas como 10 ni confunde arena gruesa con fina',()=>{
 const changed={...input,quotedItems:[
  {...input.quotedItems[0],quantity:'5'},
  {...input.quotedItems[1],description:'Arena gruesa - bolsón 1 m³'},
  input.quotedItems[2]
 ]};
 const r=resumirOfertaComercialV2(changed,points);
 assert.equal(r.cobertura?.identificados,1);
 assert.equal(r.cobertura?.solicitados,3);
 assert.equal(r.cobertura?.porVerificar.length,2);
});
test('D016 equivalencia de presentación por masa verificable: 20 x 25kg = 10 x 50kg',()=>{
 const changed={...input,quotedItems:[{
  ...input.quotedItems[0],description:'Cemento CPC - bolsa 25 kg',
  quantity:'20'
 },...input.quotedItems.slice(1)]};
 assert.equal(resumirOfertaComercialV2(changed,points).cobertura?.identificados,3);
});
test('D016 cantidades ambiguas y rubros distintos no se cuentan',()=>{
 const wrong={...input,quotedItems:[
  {...input.quotedItems[0],quantity:'a confirmar'},
  {...input.quotedItems[1],ambiguity:'se requiere revisión'},
  {...input.quotedItems[2],description:'Pintura látex interior - lata de 20 litros'}
 ]};
 assert.equal(resumirOfertaComercialV2(wrong,points).cobertura?.identificados,0);
});
test('D016 no duplica artículos: una oferta no cubre dos líneas repetidas',()=>{
 const requestItems=[input.requestItems[1],{...input.requestItems[1],line:4}];
 const r=resumirOfertaComercialV2({totalLiteral:null,requestItems,
  quotedItems:[input.quotedItems[1]]},[]);
 assert.equal(r.cobertura?.identificados,1);
 assert.equal(r.cobertura?.solicitados,2);
 assert.equal(r.totalDeclarado,null);
 assert.equal(r.condiciones.iva,'No verificado');
});
test('D016 sin extracción no se inventa monto, cantidad ni IVA',()=>{
 for(const raw of [null,undefined,{},{
  totalLiteral:'TOTAL calculado 1.000.000',requestItems:[],quotedItems:[]
 }]){
  const r=resumirOfertaComercialV2(raw,[]);
  assert.equal(r.totalDeclarado,null);
  assert.equal(r.cobertura,null);
  assert.equal(r.condiciones.flete,'No verificado');
 }
});
test('D016 ignora cifras malformadas, contactos y cantidades de origen ambiguo',()=>{
 const untrusted={...input,
  totalLiteral:'$ 355.400 <script>',
  requestItems:[{...input.requestItems[0],description:'123456789012345@bad.com'}]};
 const r=resumirOfertaComercialV2(untrusted,points);
 assert.equal(r.totalDeclarado,null);
 assert.equal(r.cobertura,null);
});
test('D016 documentos adicionales no se declaran faltantes del pedido',()=>{
 const quote={...input,quotedItems:[...input.quotedItems,{
  line:4,description:'Pallet retornable',quantity:'1',unit:'unidad',ambiguity:null}]};
 const r=resumirOfertaComercialV2(quote,points);
 assert.equal(r.cobertura?.identificados,3);
 assert.equal(r.cobertura?.adicionales,1);
});
test('D016 SQL comercial solo consulta el documento identificado por SHA y sesión privada',()=>{
 const sql=readFileSync(new URL(
  '../../supabase/piloto/v2_d016_resumen_comercial_original_autorizado_CANDIDATE.sql',
  import.meta.url),'utf8');
 for(const phrase of ['cotironda_piloto_v2_d016_responders_with_analysis_private',
  "q.message_hmac=v_source->>'messageHmac'",
  "q.supplier_key=v_source->>'supplierKey'",
  "q.source_sha256=v_source->>'sha256'",
  'request_id=p_request_id',
  'LIMIT 100',
  'd016_commercial_existing_analysis_rpc_drift',
  'd016_commercial_exposed_rpc'
 ])assert.ok(sql.includes(phrase),phrase);
 assert.doesNotMatch(sql,/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+\S+\s+TO\s+(?:PUBLIC|anon|authenticated)/iu);
});
test('D016 dashboard mantiene la descarga real, análisis original y claridad comercial',()=>{
 const ui=readFileSync(new URL(
  '../../apps/portal/app/piloto/v2/rondas/[rondaId]/whatsapp/respuestas-whatsapp.tsx',
  import.meta.url),'utf8');
 for(const phrase of ['Total declarado','Artículos identificados','Condiciones de la oferta',
  'q.resumen.totalDeclarado','q.resumen.cobertura',
  'Observaciones y evidencias del análisis','Descargar original',
  'informe-final-whatsapp','credentials:','cerrarSesion']){
  assert.ok(ui.includes(phrase),phrase);
 }
 assert.ok(ui.includes('<details className="coti-analysis-details">'));
});
