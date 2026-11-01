import test from 'node:test';
import assert from 'node:assert/strict';
import {
 MENSAJE_DEMO_MVP065,crearPrototipoWhatsAppMvp065,
 registrarCorreccionFicticiaMvp065,resumenFuenteFielMvp065,
 evaluarCoberturaMvp065
} from '../../src/domain/prototipo-whatsapp-mvp065.ts';

test('MVP065: mensaje natural del arquitecto llega a DOS corralones + UNA pinturería sin WhatsApp real',()=>{
 const escenario=crearPrototipoWhatsAppMvp065(MENSAJE_DEMO_MVP065);
 assert.equal(escenario.pedido.zonaEntrega,'La Plata');
 assert.equal(escenario.pedido.items.length,3);
 assert.deepEqual(escenario.pedido.items.map(x=>x.product_code),[
  'cemento_gris_obra','hidrofugo','pintura_latex'
 ]);
 assert.equal(escenario.personas,4);
 assert.equal(escenario.whatsappEnviados,0);
 assert.equal(escenario.datosGuardados,false);
 assert.deepEqual(escenario.ofertas.map(o=>o.id),[
  'corralon_a','corralon_b','pintureria_c'
 ]);
 assert.deepEqual(escenario.ofertas.map(o=>o.productosPedido.length),[2,2,1]);
 assert.deepEqual(escenario.ofertas.map(o=>o.productosCotizados.length),[2,1,1]);
 const cobertura=evaluarCoberturaMvp065(escenario,escenario.ofertas);
 assert.equal(cobertura.invitaciones,3);
 assert.equal(cobertura.cubiertos.length,3);
 assert.equal(cobertura.sinProveedor.length,0);
 assert.deepEqual(cobertura.posiblesCoberturasConDos,['Proveedor A + Proveedor C']);
 assert.equal(cobertura.comparacionEconomica,'no_verificable_sin_iva_y_cargos');
});

test('MVP065: fuente EXACTA preserva pallets, bolsones, flete, descuento, total literal',()=>{
 const s=crearPrototipoWhatsAppMvp065(MENSAJE_DEMO_MVP065);
 const a=s.ofertas[0].historial[0];
 const r=resumenFuenteFielMvp065(a);
 assert.ok(a.includes('2 pallets vacíos x $ 7.000,00 = $ 14.000,00'));
 assert.ok(a.includes('1 bolsón vacío x $ 3.500,00 = $ 3.500,00'));
 assert.ok(a.includes('Flete a obra: $ 12.000,00'));
 assert.ok(a.includes('Descuento comercial: -$ 3.000,00'));
 assert.equal(r.totalLiteral,'$ 258.500,00');
 assert.deepEqual(r.lineas,a.split('\n'));
 assert.ok(r.lineas.length>6);
 assert.equal(Object.isFrozen(r.lineas),true);
 assert.equal(r.revisionTotal,false);
});

test('MVP065: proveedor B cotiza parcial y TOTAL NO se compara con oferta completa',()=>{
 const s=crearPrototipoWhatsAppMvp065(MENSAJE_DEMO_MVP065);
 const b=s.ofertas[1];
 assert.equal(b.productosPedido.length,2);
 assert.equal(b.productosCotizados.length,1);
 const r=resumenFuenteFielMvp065(b.historial[0]);
 assert.equal(r.totalLiteral,'$ 182.000,00');
 assert.ok(b.historial[0].includes('flete a convenir'));
 assert.ok(b.historial[0].includes('IVA no aclarado'));
 assert.equal(evaluarCoberturaMvp065(s,s.ofertas).comparacionEconomica,
  'no_verificable_sin_iva_y_cargos');
});

test('MVP065: corrección de texto crea otra versión sin borrar ni normalizar el original',()=>{
 const s=crearPrototipoWhatsAppMvp065(MENSAJE_DEMO_MVP065);
 const original=s.ofertas[0];
 const changed=original.historial[0].replace(
  '2 pallets vacíos','3 pallets vacíos').replace(
  'TOTAL FINAL: $ 258.500,00','TOTAL FINAL: $ 999.999,99');
 const v2=registrarCorreccionFicticiaMvp065(original,changed);
 assert.notEqual(original,v2);
 assert.equal(v2.historial.length,2);
 assert.equal(v2.historial[0],original.historial[0]);
 assert.equal(v2.historial[1],changed);
 assert.equal(resumenFuenteFielMvp065(v2.historial[1]).totalLiteral,'$ 999.999,99');
 assert.equal(resumenFuenteFielMvp065(v2.historial[0]).totalLiteral,'$ 258.500,00');
 const cover=evaluarCoberturaMvp065(s,[v2,s.ofertas[1],s.ofertas[2]]);
 assert.equal(cover.posiblesCoberturasConDos.length,0);
 assert.equal(cover.sinProveedor.includes('hidrofugo'),true);
 assert.equal(s.whatsappEnviados,0);
});

test('MVP065: no existe adjudicación automática ni datos de identificación real',()=>{
 const s=crearPrototipoWhatsAppMvp065(MENSAJE_DEMO_MVP065);
 const serialized=JSON.stringify(s);
 for(const banned of ['@s.whatsapp.net','api_token','secret','telefono','adjudicar','whapi.cloud']){
  assert.equal(serialized.includes(banned),false,banned);
 }
 assert.equal(s.ofertas.every(x=>x.anonimo.startsWith('Proveedor ')),true);
});

test('MVP065: sin zona pide dato vital y sin material confiable bloquea',()=>{
 assert.throws(()=>crearPrototipoWhatsAppMvp065('20 bolsas de cemento CPC 50 kg'),
  /mvp065_demo_invalida/);
 assert.throws(()=>crearPrototipoWhatsAppMvp065(
  '20 bolsas de material inexistente. Entrega: La Plata.'),
 /mvp065_demo_invalida/);
 const fixed=crearPrototipoWhatsAppMvp065('20 bolsas de cemento CPC 50 kg','La Plata');
 assert.equal(fixed.pedido.zonaEntrega,'La Plata');
 assert.equal(fixed.ofertas.length,2);
});

test('MVP065: no se inventa total cuando falta o hay varios discrepantes',()=>{
 const raws=[
  ['Cemento $ 95.000,00\nFlete a convenir',null,false],
  ['TOTAL FINAL: $ 20.000,00\nTOTAL GENERAL: $ 30.000,00',null,true],
  ['TOTAL estimado: consultar',null,true],
  ['TOTAL: $ 1.234,56','$ 1.234,56',false]
 ];
 for(const [text,total,ambiguous] of raws){
  const r=resumenFuenteFielMvp065(text);
  assert.equal(r.totalLiteral,total,text);
  assert.equal(r.revisionTotal,ambiguous,text);
  assert.deepEqual(r.lineas,text.split('\n'));
 }
});

test('MVP065: cotización con CRLF y renglones vacíos se presenta exactamente',()=>{
 const t='Cemento $ 12.000,00\r\n\r\npallet vacío $ 200,00\r\nTOTAL: $ 12.200,00';
 const r=resumenFuenteFielMvp065(t);
 assert.deepEqual(r.lineas,['Cemento $ 12.000,00','',
  'pallet vacío $ 200,00','TOTAL: $ 12.200,00']);
 assert.equal(r.totalLiteral,'$ 12.200,00');
});

test('MVP065: entradas abusivas para cotizaciones o correcciones no se aceptan',()=>{
 const base=crearPrototipoWhatsAppMvp065(MENSAJE_DEMO_MVP065);
 for(const txt of ['', 'x'.repeat(12001),'   '])
  assert.throws(()=>registrarCorreccionFicticiaMvp065(base.ofertas[0],txt),
   /mvp065_demo_invalida/);
 assert.throws(()=>resumenFuenteFielMvp065('x'.repeat(12001)),
  /mvp065_demo_invalida/);
});
