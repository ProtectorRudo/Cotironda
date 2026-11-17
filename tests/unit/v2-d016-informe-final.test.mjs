import test from 'node:test';
import assert from 'node:assert/strict';
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
 assert.ok(!norte.evidencias.some(x=>x.categoria==='plazo'));
 assert.deepEqual(report.comparacion.map(x=>x.comercio),['Corralón Norte','Pinturería Sur']);
 assert.ok(!JSON.stringify(report).includes('"ganador":'));
 assert.ok(!JSON.stringify(report).includes('"adjudicado":'));
});
