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
  'Descuento informado','Descargar original','originales-whatsapp',
  'informe-final-whatsapp','credentials:', 'cerrarSesion',
  'aria-expanded={expanded}','coti-clean-bid-expanded',
  'articulosVisibles','Equivalencias técnicas por comprobar'
 ])assert.ok(ui.includes(phrase),phrase);
 assert.ok(ui.includes('PDF original'));
 assert.ok(!ui.includes("['Entrega',q.resumen.condiciones.entrega]"));
 // Las cifras individuales quedan exclusivamente en el presupuesto original.
 assert.doesNotMatch(ui,/Artículos e importes extraídos del presupuesto/u);
 assert.doesNotMatch(ui,/q\.resumen\.detalleCotizado\.map\(/u);
 assert.doesNotMatch(ui,/item\.precioUnitario|item\.subtotal/u);
 const details=ui.slice(ui.indexOf('<h4>Lo importante de este presupuesto</h4>'),
  ui.indexOf('</div>}\n   </article>'));
 assert.ok(details.length>0);
 assert.doesNotMatch(details,/Más observaciones|puntosUtiles/u);
 assert.doesNotMatch(details,/q\.resumen\.totalDeclarado/u);
 assert.equal((ui.match(/q\.resumen\.totalDeclarado/gu)??[]).length,1);
 assert.match(details,/notasTecnicas\.slice\(0,3\)/u);
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

test('D019: dos importes en una misma evidencia conservan su etiqueta exacta',()=>{
 const evidence=[{categoria:'precio',
  evidencia:'Subtotal: $293.991,23; Total: $355.400,00',
  observacion:'El documento informa subtotal y total por separado.'}];
 const a=resumirOfertaComercialV2({...input,totalLiteral:'$293.991,23'},evidence);
 const b=resumirOfertaComercialV2({...input,totalLiteral:'$355.400,00'},evidence);
 assert.equal(a.tipoImporte,'Subtotal informado');
 assert.equal(b.tipoImporte,'Total informado');
 const no=resumirOfertaComercialV2({...input,totalLiteral:'$700.000,00'},evidence);
 assert.equal(no.tipoImporte,'Importe informado');
});


test('V2 real: cinco renglones comprador, tres enviados a Ailín y tres cotizados',()=>{
 const request=[...input.requestItems,
  {line:4,description:'15 perfiles montantes 70 mm',quantity:'15',unit:'unit'},
  {line:5,description:'8 placas de yeso de 12,5 mm',quantity:'8',unit:'unit'}];
 const raw={totalLiteral:'$351.155,11',requestItems:request,
  assignedItems:input.requestItems,
  quotedItems:[
   {line:1,description:'cemento avellaneda x 25 kg; Dscto. 22.4%',
    quantity:'20,00',unit:'',unitPrice:'$9.798,58',
    lineTotal:'$152.074,00',ambiguity:null},
   {line:2,description:'BIG BAG de Arena; Dscto. 22.4%',
    quantity:'2,00',unit:'',unitPrice:'$73.664,80',
    lineTotal:'$114.327,76',ambiguity:null},
   {line:3,description:'BIG BAG de Piedra; Dscto. 22.4%',
    quantity:'1,00',unit:'',unitPrice:'$109.218,23',
    lineTotal:'$84.753,35',ambiguity:null}
  ],
  termsLiteral:'Condición de pago : 1. Contado Efectivo; FLETE A CONVENIR; Plazo de entrega : 0 DIAS'
 };
 const result=resumirOfertaComercialV2(raw,[]);
 assert.equal(result.solicitado.length,5);
 assert.equal(result.cobertura?.solicitados,3);
 assert.equal(result.articulosEnviados,3);
 assert.equal(result.articulosCotizados,3);
 assert.equal(result.totalDeclarado,'$351.155,11');
 assert.equal(result.condiciones.iva,'No informado');
 assert.equal(result.condiciones.flete,'A convenir');
 assert.equal(result.condiciones.pago,'Contado en efectivo');
 assert.equal(result.descuento,'22,4 % en todos los artículos');
 assert.deepEqual(result.detalleCotizado.map(x=>x.subtotal),
  ['$152.074,00','$114.327,76','$84.753,35']);
 assert.notEqual(result.cobertura?.identificados,3,
  'no inventar equivalencia técnica entre marcas y tamaños');
});
test('V2 no deduce condiciones omitidas ni permite que datos de contacto se filtren',()=>{
 const actual={...input,assignedItems:input.requestItems,
  termsLiteral:'Teléfono: 221 555 8888; Pago en efectivo; FLETE A CONVENIR',
  quotedItems:[{...input.quotedItems[0],unitPrice:'$9.000',
   lineTotal:'$90.000'}]};
 const result=resumirOfertaComercialV2(actual,[]);
 assert.equal(result.condiciones.pago,'No informado');
 assert.equal(result.condiciones.flete,'No informado');
 assert.equal(result.condiciones.iva,'No informado');
 assert.equal(result.articulosCotizados,1);
 assert.equal(result.detalleCotizado[0].subtotal,'$90.000');
});
test('V2 SQL de proyección conserva original SHA, invitación real y ACL',()=>{
 const sql=readFileSync(new URL(
  '../../supabase/piloto/v2_d016_comercial_completo_por_proveedor_CANDIDATE.sql',
  import.meta.url),'utf8');
 for(const x of [
  'invitation_lines_mvp099',
  "assigned.supplier_key=v_source->>'supplierKey'",
  "'assignedItems'",
  "'termsLiteral'",
  "'lineTotal',offered.line_total_literal",
  "'unitPrice',offered.unit_price_literal",
  'a.content_sha256=q.source_sha256',
  "a.storage_path='media/'||a.message_hmac",
  'v2_d016_original_source_private',
  'commercial_postcheck_failed',
  'analysis_finish_postcheck_failed',
  'NOT BETWEEN 2 AND 8',
  'has_function_privilege'
 ])assert.ok(sql.includes(x),x);
 assert.doesNotMatch(sql,/GRANT\s+(?:ALL|EXECUTE)\s+ON/iu);
 assert.doesNotMatch(sql,/net\.http|whapi\.cloud|messages\/document/iu);
 const rollback=readFileSync(new URL(
  '../../supabase/piloto/v2_d016_comercial_completo_por_proveedor_ROLLBACK_ONLY.sql',
  import.meta.url),'utf8');
 assert.ok(rollback.includes('commercial_rollback_drift'));
 assert.ok(rollback.includes('analysis_rollback_drift'));
});

test('V2: flete a convenir citado en evidencia IA se muestra sin inventar un importe',()=>{
 const cases=[
  'FLETE A CONVENIR',
  'El costo del flete queda a convenir; no se especifica importe.',
  'Costo de Flete: a convenir'
 ];
 for(const evidencia of cases){
  const result=resumirOfertaComercialV2({...input,termsLiteral:null},[
   {categoria:'flete',evidencia,
    observacion:'El documento deja el costo del flete a convenir.'}
  ]);
  assert.equal(result.condiciones.flete,'A convenir',evidencia);
 }
 const unknown=resumirOfertaComercialV2({...input,termsLiteral:null},[
  {categoria:'flete',evidencia:'Flete: importe a confirmar.',
   observacion:'El costo del flete no quedó informado.'}
 ]);
 assert.equal(unknown.condiciones.flete,'No informado');
 const explicit=resumirOfertaComercialV2({...input,termsLiteral:null},[
  {categoria:'flete',evidencia:'Flete no incluido; importe a cotizar.',
   observacion:'El flete no se incluye en el precio.'}
 ]);
 assert.equal(explicit.condiciones.flete,'No incluido · a cotizar');
});

test('D021: cuenta articulos cotizados aunque las equivalencias esten pendientes',()=>{
 const raw={totalLiteral:null,requestItems:[...input.requestItems,
  {line:4,description:'Montante galvanizado',quantity:'15',unit:'unidad'},
  {line:5,description:'Placa de yeso',quantity:'8',unit:'unidad'}],
  assignedItems:input.requestItems,
  quotedItems:[
   {line:1,description:'Cemento 50 kg loma negra',quantity:'10',
    unit:'bolsas',unitPrice:'$105.000',lineTotal:null,
    ambiguity:'Marca y equivalencia a verificar'},
   {line:2,description:'arena',quantity:'2',unit:'bolsones',
    unitPrice:'$150.000',lineTotal:null,
    ambiguity:'Variante de arena no indicada'},
   {line:3,description:'piedra',quantity:'1',unit:'bolson',
    unitPrice:'$100.000',lineTotal:null,
    ambiguity:'Presentacion no confirmada'}
  ]};
 const r=resumirOfertaComercialV2(raw,[]);
 assert.equal(r.articulosCotizados,3,'cada articulo con precio cuenta como cotizado');
 assert.equal(r.articulosEnviados,3);
 assert.equal(r.detalleCotizado.length,3);
 assert.equal(r.cobertura,null,'la ambiguedad no equivale a coincidencia tecnica');
 assert.equal(r.totalDeclarado,null,'no inventar total a partir de precios');
 assert.equal(r.tipoImporte,'Importe no informado');
 assert.deepEqual(r.condiciones,{iva:'No informado',flete:'No informado',
  pago:'No informado',entrega:'No informado'});
});
test('D021: el contador no infiere articulos de lineas invalidas o duplicadas',()=>{
 const ambiguous={...input,quotedItems:[
  {...input.quotedItems[0],ambiguity:'Marca por verificar'},
  {...input.quotedItems[0],ambiguity:'Repetida'}
 ]};
 const r=resumirOfertaComercialV2(ambiguous,[]);
 assert.equal(r.articulosCotizados,null,'no declarar cantidad con identificadores repetidos');
 assert.equal(r.cobertura,null);
});
test('D021: el portal informa equivalencias pendientes sin repetir importes',()=>{
 const ui=readFileSync(new URL(
  '../../apps/portal/app/piloto/v2/rondas/[rondaId]/whatsapp/respuestas-whatsapp.tsx',
  import.meta.url),'utf8');
 assert.match(ui,/Hay artículos cotizados, pero todavía falta confirmar/u);
 assert.match(ui,/q\.resumen\.detalleCotizado\.length>0/u);
 assert.match(ui,/articulosVisibles\+' artículos cotizados'/u);
 assert.doesNotMatch(ui,/item\.precioUnitario|item\.subtotal/u);
});

test('D021: Nahuel conserva suma de 3 renglones sin inventar total declarado',()=>{
 const original={...input,totalLiteral:null,quotedItems:[
  {line:1,description:'Cemento 50 kg loma negra',quantity:'10',
   unit:'bolsas',lineTotal:'$105.000',unitPrice:null,
   ambiguity:'Marca por verificar'},
  {line:2,description:'arena',quantity:'2',unit:'bolsón',
   lineTotal:'$150.000',unitPrice:null,ambiguity:'Tipo de arena por verificar'},
  {line:3,description:'piedra',quantity:'1',unit:'bolsón',
   lineTotal:'$100.000',unitPrice:null,ambiguity:'Presentación por verificar'}
 ]};
 const r=resumirOfertaComercialV2(original,[]);
 assert.equal(r.totalDeclarado,null);
 assert.equal(r.sumaCalculada,'$355.000');
 assert.equal(r.discrepanciaTotal,false,'sin total literal confiable no se afirma discordancia');
 assert.equal(r.tipoImporte,'Importe no informado');
 assert.equal(r.articulosCotizados,3);
 assert.equal(r.cobertura,null,'un precio no certifica equivalencia de materiales');
});
test('D021: no publica suma parcial ni extrapola precios unitarios',()=>{
 const row={...input.quotedItems[0],lineTotal:'$105.000'};
 const second={...input.quotedItems[1],lineTotal:'$150.000'};
 const third={...input.quotedItems[2],lineTotal:'$100.000'};
 for(const quotedItems of [
  [row,second,{...third,lineTotal:null,unitPrice:'$100.000'}],
  [row,{...second,lineTotal:'$150.000 COP'},third],
  [row,{...second,lineTotal:'$1,234.56'},third],
  [row,{...second,lineTotal:'USD 150.00'},third],
  [row,{...second,line:1},third]
 ]){
  const r=resumirOfertaComercialV2({...input,totalLiteral:null,quotedItems},[]);
  assert.equal(r.sumaCalculada,null,JSON.stringify(quotedItems));
 }
 assert.equal(resumirOfertaComercialV2({...input,totalLiteral:null},[]).sumaCalculada,null);
});
test('D021: suma centavos exactos y separadores ARS/USD sin mezclar monedas',()=>{
 const make=(a,b)=>resumirOfertaComercialV2({...input,totalLiteral:null,quotedItems:[
  {...input.quotedItems[0],lineTotal:a},
  {...input.quotedItems[1],lineTotal:b}
 ]},[]);
 assert.equal(make('$1.234,50','$2,25').sumaCalculada,'$1.236,75');
 assert.equal(make('ARS 1.234.567,80','ARS 1,20').sumaCalculada,'$1.234.569');
 assert.equal(make('USD 1,234.50','USD 100.00').sumaCalculada,'USD 1.334,50');
 assert.equal(make('USD 1,234.50','$100').sumaCalculada,null);
 assert.equal(make('$9.999.999.999.999.999','$1').sumaCalculada,null,
  'rechazar importes que exceden enteros seguros');
});
test('D021: alerta sólo al cotejar total explícito con suma completa',()=>{
 const quotedItems=[
  {...input.quotedItems[0],lineTotal:'$105.000'},
  {...input.quotedItems[1],lineTotal:'$150.000'},
  {...input.quotedItems[2],lineTotal:'$100.000'}
 ];
 const base={...input,quotedItems};
 const bad=resumirOfertaComercialV2({...base,totalLiteral:'$355.00'},[{
  categoria:'precio',evidencia:'Total: $355.00',
  observacion:'El presupuesto declara un importe total.'
 }]);
 assert.equal(bad.sumaCalculada,'$355.000');
 assert.equal(bad.totalDeclarado,'$355.00');
 assert.equal(bad.tipoImporte,'Total informado');
 assert.equal(bad.discrepanciaTotal,true);
 const good=resumirOfertaComercialV2({...base,totalLiteral:'$355.000'},[{
  categoria:'precio',evidencia:'Total: $355.000',
  observacion:'La cifra coincide con el total escrito.'
 }]);
 assert.equal(good.discrepanciaTotal,false);
 const subtotal=resumirOfertaComercialV2({...base,totalLiteral:'$355.00'},[{
  categoria:'precio',evidencia:'Subtotal: $355.00',
  observacion:'El documento declara un subtotal.'
 }]);
 assert.equal(subtotal.discrepanciaTotal,false,
  'subtotales pueden diferir por IVA, flete u otros conceptos');
});
test('D021: portal y cierre distinguen suma calculada de total declarado',()=>{
 const ui=readFileSync(new URL(
  '../../apps/portal/app/piloto/v2/rondas/[rondaId]/whatsapp/respuestas-whatsapp.tsx',
  import.meta.url),'utf8');
 assert.match(ui,/importeDeclarado\?\?sumaCalculada\?\?'No informado'/u);
 assert.match(ui,/esSuma\?'Suma de artículos cotizados'/u);
 assert.match(ui,/el total declarado por el proveedor no está confirmado/u);
 assert.match(ui,/q\.resumen\.discrepanciaTotal/u);
 assert.doesNotMatch(ui,/item\.precioUnitario|item\.subtotal/u);
 const report=readFileSync(new URL('../../src/server/v2-d016-informe-final.ts',
  import.meta.url),'utf8');
 assert.match(report,/importe:quote\.resumen\?\.totalDeclarado\?\?quote\.resumen\?\.sumaCalculada\?\?null/u);
 assert.match(report,/Suma de artículos cotizados/u);
 assert.doesNotMatch(report,/ganador\s*autom[aá]tico/iu);
});


test('D016 regresión real: Nahuel 3 renglones sin unidad ni símbolo monetario',()=>{
 // Reproduce forma de extracción autorizada observada en Supabase piloto,
 // con descripciones sintéticas para no filtrar el documento original.
 const requested=[
  {line:1,description:'Cemento bolsa 25 kg',quantity:'14',unit:'bolsas'},
  {line:2,description:'Arena fina m3',quantity:'3',unit:'bolsones'},
  {line:3,description:'Piedra partida m3',quantity:'2',unit:'bolsones'},
  {line:4,description:'Material no vendido',quantity:'1',unit:'unidad'}
 ];
 const raw={
  totalLiteral:'438000',requestItems:requested,assignedItems:requested.slice(0,3),
  quotedItems:[
   {line:1,description:'Cemento bolsa 25 kg',quantity:'14',
    unit:null,unitPrice:'6500',lineTotal:'91000',ambiguity:null},
   {line:2,description:'Arena fina',quantity:'3',
    unit:null,unitPrice:'57000',lineTotal:'171000',ambiguity:null},
   {line:3,description:'Piedra partida',quantity:'2',
    unit:null,unitPrice:'88000',lineTotal:'176000',ambiguity:null}
  ]
 };
 const result=resumirOfertaComercialV2(raw,[]);
 assert.equal(result.totalDeclarado,'438000',
  'conservar exactamente el literal de la fuente sin agregar $');
 assert.equal(result.tipoImporte,'Importe informado · moneda no especificada');
 assert.equal(result.articulosCotizados,3);
 assert.equal(result.articulosEnviados,3);
 assert.equal(result.detalleCotizado.length,3);
 assert.deepEqual(result.detalleCotizado.map(x=>x.subtotal),
  ['91000','171000','176000']);
 assert.equal(result.sumaCalculada,'438.000');
 assert.equal(result.solicitado.length,4);
 assert.equal(result.cobertura?.solicitados,3);
 assert.ok(result.cobertura?.identificados<3,
  'no transformar automáticamente cantidad sin unidad en equivalencia técnica');
 assert.deepEqual(result.condiciones,{iva:'No informado',flete:'No informado',
  pago:'No informado',entrega:'No informado'});
});

test('D016 otros formatos: sin moneda explícita no inventar ARS ni sumar cifras incompletas',()=>{
 const item=(line,amount)=>({line,description:'Material '+line,quantity:'1',
  unit:null,unitPrice:null,lineTotal:amount,ambiguity:null});
 const basic={requestItems:input.requestItems,assignedItems:input.requestItems,
  quotedItems:[item(1,'70000'),item(2,'25000'),item(3,'3000')]};
 const result=resumirOfertaComercialV2({...basic,totalLiteral:'98000'},[]);
 assert.equal(result.sumaCalculada,'98.000');
 assert.equal(result.totalDeclarado,'98000');
 assert.equal(result.tipoImporte,'Importe informado · moneda no especificada');
 assert.equal(result.articulosCotizados,3);
 for(const bad of ['Total: 98000','98000 pesos','1,2,3','1234567890123']){
  assert.equal(resumirOfertaComercialV2({...basic,totalLiteral:bad},[]).totalDeclarado,null,bad);
 }
 for(const unknown of [[item(1,'70000'),item(2,null)],
  [item(1,'70000'),item(2,'USD 25000')],
  [item(1,'70000'),item(1,'25000')]]){
  assert.equal(resumirOfertaComercialV2({...basic,totalLiteral:null,quotedItems:unknown},[]).sumaCalculada,null);
 }
 const withoutLine=resumirOfertaComercialV2({...basic,totalLiteral:'98000',
  quotedItems:[{line:1,description:'Material 1',quantity:'1',
   unit:null,unitPrice:'98000',lineTotal:null}]},[]);
 assert.equal(withoutLine.sumaCalculada,null,'precios unitarios no producen totales');
});

test('D016 portal: expandir análisis muestra importe y renglones sin precios de cada línea',()=>{
 const ui=readFileSync(new URL(
  '../../apps/portal/app/piloto/v2/rondas/[rondaId]/whatsapp/respuestas-whatsapp.tsx',
  import.meta.url),'utf8');
 const expanded=ui.slice(ui.indexOf('<h4>Lo importante de este presupuesto</h4>'));
 assert.match(expanded,/coti-clean-commercial-recap/u);
 assert.match(expanded,/Importe declarado:/u);
 assert.match(expanded,/importeDeclarado\?\?sumaCalculada\?\?'No informado'/u);
 assert.match(expanded,/Renglones cotizados:/u);
 assert.match(expanded,/Coincidencia técnica:/u);
 assert.match(expanded,/cover\.identificados/u);
 assert.doesNotMatch(expanded,/item\.precioUnitario|item\.subtotal/u);
});
