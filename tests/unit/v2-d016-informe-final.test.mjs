import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {componerInformeFinalD016}
 from '../../src/server/v2-d016-informe-final.ts';

const ROUND='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC1='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DOC2='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DOC3='dddddddd-dddd-4ddd-addd-dddddddddddd';
const NOW=1800000000000, CLOSED=NOW-5000;
const state=()=>({state:'closed_verified_business_two_days',
 requestId:ROUND,closedAtMs:CLOSED});
const punto=(categoria,evidencia,observacion)=>
 ({categoria,evidencia,observacion});
const data=()=>({estado:'cotizaciones_recibidas',
 mensaje:'Cotizaciones recibidas',
 respuestas:[
  {documentoId:DOC1,comercio:'Corralón Norte',formato:'PDF',
   recibidoMs:NOW-90000,analisis:'Lo importante de este presupuesto',
   puntos:[punto('iva','IVA no informado',
    'El documento no indica el tratamiento del IVA.'),
    punto('material','Cemento 50 kg',
     'Presentación ofrecida en bolsas de cincuenta kilogramos.')]},
  {documentoId:DOC2,comercio:'Corralón Norte',formato:'Excel',
   recibidoMs:NOW-70000,analisis:'Análisis en preparación',puntos:[]},
  {documentoId:DOC3,comercio:'Pinturería Sur',formato:'WhatsApp (texto)',
   recibidoMs:NOW-50000,analisis:'Lo importante de este presupuesto',
   puntos:[punto('flete','Flete a coordinar',
     'La entrega requiere coordinación con el proveedor.'),
    punto('forma_pago','Pago contado',
     'La condición de pago indicada es contado.')]}
 ]});
test('D016 informe: solo cierre SQL verificado, 3 documentos/2 comercios, parcial explícito',()=>{
 const res=componerInformeFinalD016(state(),data(),NOW);
 assert.equal(res.estado,'informe_final_disponible');
 assert.equal(res.documentos,3);assert.equal(res.comercios,2);
 assert.equal(res.analizados,2);assert.equal(res.sinAnalisis,1);
 assert.equal(res.cierreMs,CLOSED);
 assert.deepEqual(res.comparacion.map(x=>x.comercio),
  ['Corralón Norte','Pinturería Sur']);
 assert.equal(res.comparacion[0].documentos,2);
 assert.equal(res.comparacion[0].condiciones.iva,'citado_en_guia');
 assert.equal(res.comparacion[0].condiciones.flete,'no_identificado_en_guia');
 assert.equal(res.comparacion[1].condiciones.flete,'citado_en_guia');
 assert.equal(res.comparacion[1].condiciones.forma_pago,'citado_en_guia');
 assert.match(res.resumen,/requieren lectura directa/u);
 assert.ok(res.observaciones.some(x=>/NO demuestra/u.test(x)));
 assert.ok(res.observaciones.some(x=>/No se ordenan ofertas por precio total/u.test(x)));
 assert.ok(!JSON.stringify(res).includes('ganador":"'));
});
test('D016 informe: sin calendario/cierre, fuera de tiempo y ronda ajena = nada',()=>{
 for(const x of [
  {...state(),state:'waiting_for_close'},
  {...state(),state:'closed'},
  {...state(),requestId:'wrong'},
  {...state(),closedAtMs:NOW+1},
  {...state(),closedAtMs:0},
  {...state(),closedAtMs:NaN},
  null
 ])assert.equal(componerInformeFinalD016(x,data(),NOW),null);
});
test('D016 informe: sin ofertas, no inventa proveedores, ranking ni montos',()=>{
 const cat={...data(),respuestas:[]};
 const res=componerInformeFinalD016(state(),cat,NOW);
 assert.equal(res.documentos,0);assert.equal(res.comercios,0);
 assert.equal(res.comparacion.length,0);
 assert.match(res.resumen,/sin presupuestos/u);
 assert.ok(!JSON.stringify(res).includes('mejor precio'));
});
test('D016 informe: rechaza ID duplicado y observaciones malformadas',()=>{
 const duplicated=data();
 duplicated.respuestas[1].documentoId=DOC1;
 assert.equal(componerInformeFinalD016(state(),duplicated,NOW),null);
 const corrupted=data();
 corrupted.respuestas[0].puntos[0].evidencia='x';
 assert.equal(componerInformeFinalD016(state(),corrupted,NOW),null);
});

test('D019: el informe compara por comercio sin ordenar ganadores ni inventar importes',()=>{
 const cat=data();
 cat.respuestas[0].resumen={
  totalDeclarado:'$293.991,23',tipoImporte:'Subtotal informado',
  cobertura:{identificados:1,solicitados:3,porVerificar:['Cemento CPC 50 kg'],adicionales:0},
  condiciones:{pago:'Contado en efectivo',iva:'No informado',flete:'No informado',entrega:'No informado'}
 };
 cat.respuestas[2].resumen={
  totalDeclarado:'$355.400',tipoImporte:'Importe informado',
  cobertura:{identificados:3,solicitados:3,porVerificar:[],adicionales:0},
  condiciones:{pago:'No informado',iva:'No informado',flete:'No informado',entrega:'No informado'}
 };
 cat.respuestas[0].puntos.push(punto('plazo','Plazo de entrega 0 días',
  'El plazo de entrega indicado es 0 días.'));
 const report=componerInformeFinalD016(state(),cat,NOW);
 assert.ok(report);
 const norte=report.comparacion.find(x=>x.comercio==='Corralón Norte');
 assert.equal(norte.ofertas.length,2);
 assert.equal(norte.ofertas[0].tipoImporte,'Subtotal informado');
 assert.equal(norte.ofertas[0].pago,'Contado en efectivo');
 assert.equal(norte.ofertas[0].cobertura.identificados,1);
 assert.ok(report.recomendaciones.some(x=>/equivalencia técnica/u.test(x)));
 assert.ok(report.recomendaciones.some(x=>/total final/u.test(x)));
 assert.ok(!norte.evidencias.some(x=>x.categoria==='plazo'));
 assert.deepEqual(report.comparacion.map(x=>x.comercio),['Corralón Norte','Pinturería Sur']);
 assert.ok(!JSON.stringify(report).includes('"ganador":'));
 assert.ok(!JSON.stringify(report).includes('"adjudicado":'));
});

test('D019: matriz final coteja cada renglón sin inventar faltantes ni stock',()=>{
 const cat=data();
 const requested=[
  {line:1,description:'Cemento CPC 50 kg',quantity:'10.000',unit:'bolsas'},
  {line:2,description:'Arena fina 1 m3',quantity:'1.000',unit:'bolsón'}
 ];
 const coverage=(details,found)=>({
  identificados:found,solicitados:2,
  porVerificar:found===2?[]:['Cemento CPC 50 kg'],adicionales:0,
  detalle:details
 });
 cat.respuestas[0].resumen={
  solicitado:requested,totalDeclarado:'$350.000',tipoImporte:'Total informado',
  condiciones:{iva:'No informado',flete:'No informado',pago:'Contado',entrega:'No informado'},
  cobertura:coverage([
   {linea:1,solicitado:requested[0].description,cotizado:'Cemento CPC 50 kg',
    estado:'coincidencia_automatica',motivo:'Cantidad nominal coincidente'},
   {linea:2,solicitado:requested[1].description,cotizado:'Arena fina 1 m3',
    estado:'coincidencia_automatica',motivo:'Cantidad nominal coincidente'}
  ],2)
 };
 cat.respuestas[2].resumen={
  solicitado:requested,totalDeclarado:'$300.000',tipoImporte:'Subtotal informado',
  condiciones:{iva:'No informado',flete:'No informado',pago:'No informado',entrega:'No informado'},
  cobertura:coverage([
   {linea:1,solicitado:requested[0].description,cotizado:null,
    estado:'por_verificar',motivo:'No se confirmó correspondencia'},
   {linea:2,solicitado:requested[1].description,cotizado:'Arena fina 1 m3',
    estado:'coincidencia_automatica',motivo:'Cantidad nominal coincidente'}
  ],1)
 };
 const output=componerInformeFinalD016(state(),cat,NOW);
 assert.equal(output.materiales.length,2);
 assert.equal(output.materiales[0].material,requested[0].description);
 assert.deepEqual(output.materiales[0].comercios.map(x=>x.estado),
  ['coincidencia_automatica','por_verificar']);
 assert.equal(output.materiales[0].comercios[1].cotizado,null);
 assert.match(output.recomendaciones.join(' '),/no faltantes de stock/u);
 assert.equal(componerInformeFinalD016({...state(),state:'waiting_for_close'},cat,NOW),null);
 cat.respuestas[2].resumen.solicitado=[{...requested[0],description:'Cemento distinto'},requested[1]];
 const drift=componerInformeFinalD016(state(),cat,NOW);
 assert.equal(drift.materiales.length,0);
 assert.match(drift.recomendaciones.join(' '),/no coinciden/u);
});

test('D021 cierre real: dos respuestas cotizadas y advertencia sin ranking',()=>{
 const cat=data();
 cat.respuestas.splice(1,1);
 cat.respuestas[0].comercio='Corralón Ailín';
 cat.respuestas[0].resumen={
  totalDeclarado:'$351.155,11',sumaCalculada:null,
  tipoImporte:'Subtotal informado',articulosCotizados:3,articulosEnviados:3,
  solicitado:[],cobertura:{identificados:3,solicitados:3,
   porVerificar:[],detalle:[],adicionales:0},
  condiciones:{iva:'No informado',flete:'A convenir',
   pago:'Contado en efectivo',entrega:'No informado'}
 };
 cat.respuestas[1].comercio='Corralón Nahuel';
 cat.respuestas[1].resumen={
  totalDeclarado:null,sumaCalculada:'$355.000',
  tipoImporte:'Importe no informado',articulosCotizados:3,articulosEnviados:3,
  solicitado:[],cobertura:null,
  condiciones:{iva:'No informado',flete:'No informado',
   pago:'No informado',entrega:'No informado'}
 };
 const final=componerInformeFinalD016(state(),cat,NOW);
 assert.ok(final);
 assert.equal(final.documentos,2);
 assert.equal(final.comercios,2);
 assert.deepEqual(final.comparacion.map(x=>x.ofertas[0].articulosCotizados),[3,3]);
 assert.equal(final.comparacion[0].ofertas[0].tipoImporte,'Subtotal informado');
 assert.equal(final.comparacion[1].ofertas[0].importe,'$355.000');
 assert.equal(final.comparacion[1].ofertas[0].tipoImporte,'Suma de artículos cotizados');
 assert.match(final.conclusion,/subtotales o sumas de artículos/u);
 assert.match(final.conclusion,/equivalencias/u);
 assert.equal(final.observacionesIA.length,1,'solo evidencia IA comercial útil');
 assert.match(final.observacionesIA[0].observacion,/bolsas/u);
 assert.doesNotMatch(final.conclusion,/ganador|adjudicado|más barato/iu);
 assert.doesNotMatch(final.conclusion,/\$[0-9]/u,'no duplicar los importes');
});
test('D021 cierre de una pantalla: detalle optativo, sin matriz ni advertencias abiertas',()=>{
 const front=readFileSync(new URL(
  '../../apps/portal/app/piloto/v2/rondas/[rondaId]/whatsapp/respuestas-whatsapp.tsx',
  import.meta.url),'utf8');
 const block=front.slice(front.indexOf('{informe&&<section'),
  front.indexOf('</section>}',front.indexOf('{informe&&<section'))+11);
 assert.ok(block.length>1000);
 assert.match(block,/informe\.conclusion/u);
 assert.match(block,/oferta\.articulosCotizados/u);
 assert.match(block,/informe\.observacionesIA/u);
 assert.match(block,/<summary>Ver detalle técnico por material<\/summary>/u);
 assert.doesNotMatch(block,/Qué revisar antes de decidir|informe\.recomendaciones\.map/u);
 assert.doesNotMatch(block,/Sin datos suficientes para cotejar/u);
 assert.doesNotMatch(block,/ganador autom[aá]tico|adjudicado a/iu);
});
