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
 assert.equal(r.condiciones.iva,'No informado');
});
test('D016 sin extracción no se inventa monto, cantidad ni IVA',()=>{
 for(const raw of [null,undefined,{},{
  totalLiteral:'TOTAL calculado 1.000.000',requestItems:[],quotedItems:[]
 }]){
  const r=resumirOfertaComercialV2(raw,[]);
  assert.equal(r.totalDeclarado,null);
  assert.equal(r.cobertura,null);
  assert.equal(r.condiciones.flete,'No informado');
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
test('D019 pago informado y subtotal: no se contradice la evidencia',()=>{
 const r=resumirOfertaComercialV2({...input,totalLiteral:'$293.991,23'},[
  {categoria:'precio',evidencia:'Subtotal $293.991,23',observacion:'El presupuesto indica un subtotal de $293.991,23.'},
  {categoria:'forma_pago',evidencia:'Condición de pago : 1. Contado Efectivo',observacion:'La condición es contado en efectivo.'}
 ]);
 assert.equal(r.tipoImporte,'Subtotal informado');
 assert.equal(r.condiciones.pago,'Contado en efectivo');
 assert.equal(r.condiciones.iva,'No informado');
 assert.equal(r.condiciones.flete,'No informado');
 assert.equal(r.solicitado.length,3);
 const other=resumirOfertaComercialV2(input,[]);
 assert.equal(other.tipoImporte,'Importe informado');
 assert.equal(other.condiciones.pago,'No informado');
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
 // Diseño minimalista: información esencial a la vista y evidencia en detalle.
 for(const phrase of [
  'coti-clean-bid-price','coti-clean-coverage','Condiciones de la oferta',
  'q.resumen.totalDeclarado','q.resumen.cobertura',
  'Ver evidencia del presupuesto','Descargar original','originales-whatsapp',
  'informe-final-whatsapp','credentials:', 'cerrarSesion',
  'aria-expanded={expanded}','coti-clean-bid-expanded'
 ])assert.ok(ui.includes(phrase),phrase);
 assert.ok(ui.includes('<details className="coti-clean-evidence">'));
 assert.ok(ui.includes('PDF original'));
 assert.ok(!ui.includes("['Entrega',q.resumen.condiciones.entrega]"));
});

test('D019: explica qué se pidió y qué se cotizó, sin transformar 25 kg en 50 kg',()=>{
 const changed={...input,quotedItems:[{
  ...input.quotedItems[0],description:'Cemento CPC - bolsa 25 kg',quantity:'10'
 },...input.quotedItems.slice(1)]};
 const v=resumirOfertaComercialV2(changed,[]);
 assert.equal(v.cobertura?.identificados,2);
 assert.equal(v.cobertura?.detalle.length,3);
 assert.deepEqual(v.cobertura?.detalle.map(x=>x.estado),[
  'por_verificar','coincidencia_automatica','coincidencia_automatica'
 ]);
 assert.equal(v.cobertura?.detalle[0].cotizado,'Cemento CPC - bolsa 25 kg');
 assert.equal(v.solicitado[0].description,input.requestItems[0].description);
 assert.equal(v.cobertura?.porVerificar.length,1);
});
test('D019: 20 bolsas de 25 kg se describe como coincidencia automática, no como stock',()=>{
 const data={...input,quotedItems:[{
  ...input.quotedItems[0],description:'Cemento CPC - bolsa 25 kg',
  quantity:'20'
 },...input.quotedItems.slice(1)]};
 const v=resumirOfertaComercialV2(data,[]);
 assert.equal(v.cobertura?.identificados,3);
 assert.equal(v.cobertura?.detalle[0].estado,'coincidencia_automatica');
 assert.match(v.cobertura?.detalle[0].motivo,/revisar el original/u);
 assert.doesNotMatch(JSON.stringify(v),/stock disponible/u);
});
test('D019: la condición de pago puede estar en cita combinada sin deducir plazos',()=>{
 const value=resumirOfertaComercialV2(input,[{
  categoria:'plazo',
  evidencia:'Forma de pago y plazo: contado en efectivo.',
  observacion:'Se cita forma de pago; plazo sin confirmar.'
 }]);
 assert.equal(value.condiciones.pago,'Contado en efectivo');
 assert.equal(value.condiciones.entrega,'No informado');
 const neg=resumirOfertaComercialV2(input,[{
  categoria:'forma_pago',evidencia:'No acepta contado en efectivo.',
  observacion:'Se requiere otra forma de pago.'
 }]);
 assert.notEqual(neg.condiciones.pago,'Contado en efectivo');
});
test('D019: subtotal sin símbolo de moneda se identifica solo por importe exacto en evidencia',()=>{
 const val=resumirOfertaComercialV2({...input,totalLiteral:'$293.991,23'},[{
  categoria:'precio',evidencia:'Subtotal 293.991,23',
  observacion:'El subtotal de la oferta aparece citado.'
 }]);
 assert.equal(val.tipoImporte,'Subtotal informado');
 const noSource=resumirOfertaComercialV2({...input,totalLiteral:'$293.991,23'},[{
  categoria:'precio',evidencia:'Subtotal 123.000,00',
  observacion:'Otro subtotal, no el importe destacado.'
 }]);
 assert.equal(noSource.tipoImporte,'Importe informado');
});

test('D019 alternativa ambigua de dos proveedores nunca se asigna a un artículo',()=>{
 const val=resumirOfertaComercialV2({...input,quotedItems:[
  {...input.quotedItems[0],description:'Cemento CPC 25 kg',quantity:'10'},
  {...input.quotedItems[0],line:4,description:'Cemento CPC 40 kg',quantity:'10'}
 ]},[]);
 assert.equal(val.cobertura?.identificados,0);
 assert.equal(val.cobertura?.detalle[0].estado,'por_verificar');
 assert.equal(val.cobertura?.detalle[0].cotizado,null);
});
