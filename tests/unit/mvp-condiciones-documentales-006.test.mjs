import test from 'node:test';
import assert from 'node:assert/strict';
import {leerCondicionesPresupuesto,validarEvidenciaIA}
 from '../../src/domain/lectura-condiciones-documentales-mvp006.ts';
import {separarCondicionesComprador,condicionarMensajesProveedor}
 from '../../src/domain/condiciones-comprador-mvp006.ts';
import {generarVistaCompradorMvp,EJEMPLO_PEDIDO_MVP}
 from '../../src/domain/mvp-vista-comprador-d057.ts';
import {simularInvitacionesEconomicasDesdeTexto}
 from '../../src/domain/entrada-economica.ts';

test('MVP-006: lee IVA incluido aunque la nota esté al final del documento',()=>{
 const source='Cemento CPC 50kg x20\nObservaciones: Los precios son con IVA incluido\nAtte. corralón';
 const v=leerCondicionesPresupuesto(source);
 assert.equal(v.iva.estado,'incluido');
 assert.equal(v.iva.evidencias[0].linea,2);
 assert.match(v.iva.evidencias[0].cita,/Observaciones/);
 assert.equal(v.flete.estado,'no_informado');
 assert.equal(v.precioFinalComparable,false);
});
test('MVP-006: lee expresamente IVA no incluido, separado de IVA no informado',()=>{
 for(const s of ['precios sin IVA','IVA no incluido','Valores más IVA','NO incluye IVA']){
   const v=leerCondicionesPresupuesto('Acuerdos:\n'+s);
   assert.equal(v.iva.estado,'no_incluido',s);
 }
 const unknown=leerCondicionesPresupuesto('Precios sujetos a revisión\n20 bolsas de cemento');
 assert.equal(unknown.iva.estado,'no_informado');
 assert.match(unknown.iva.etiqueta,/no acredita su inclusión ni exclusión/);
 assert.equal(unknown.iva.evidencias.length,0);
});
test('MVP-006: detecta flete incluido, sin cargo, aparte y a convenir con origen',()=>{
 const cases=[
   ['Flete incluido','incluido'],['Envío sin cargo','sin_cargo'],
   ['Flete: $0,00','sin_cargo'],['flete aparte','adicional'],
   ['No incluye flete','adicional'],['flete a convenir','a_convenir']];
 for(const [source,expected] of cases){
   const v=leerCondicionesPresupuesto('Propuesta\n'+source);
   assert.equal(v.flete.estado,expected,source);
   assert.equal(v.flete.evidencias[0].linea,2);
 }
});
test('MVP-006: IVA y flete no citados no se convierten en costo cero ni total final',()=>{
 const v=leerCondicionesPresupuesto('20 bolsas cemento: $120000');
 assert.equal(v.iva.estado,'no_informado');
 assert.equal(v.flete.estado,'no_informado');
 assert.equal(v.precioFinalComparable,false);
 assert.doesNotMatch(v.flete.etiqueta,/gratis|sin cargo/);
});
test('MVP-006: contradicciones entre aclaraciones bloquean certeza',()=>{
 const v=leerCondicionesPresupuesto('Precios con IVA incluido\nPrecio sin IVA\nFlete incluido\nFlete aparte');
 assert.equal(v.iva.estado,'contradictorio');
 assert.equal(v.flete.estado,'contradictorio');
 assert.equal(v.iva.evidencias.length,2);
 assert.equal(v.flete.evidencias.length,2);
 assert.equal(v.precioFinalComparable,false);
});
test('MVP-006: pregunta o condición dudosa no es una afirmación del proveedor',()=>{
 for(const source of ['¿IVA incluido?','Consultar si incluye IVA','IVA sin aclarar',
  'No se especifica si incluye IVA','Confirmar IVA incluido',
  '¿Flete incluido?','Consultar flete','¿Incluye flete?']){
   const v=leerCondicionesPresupuesto(source);
   assert.equal(v.iva.estado,'no_informado',source);
   if(/flete/i.test(source))assert.ok(['no_informado','a_convenir'].includes(v.flete.estado));
 }
});
test('MVP-006: una propuesta IA solo pasa con cita literal, línea y estado concordantes',()=>{
 const source='10 bolsas cemento\nIVA incluido en estos precios\nFlete aparte';
 assert.deepEqual(validarEvidenciaIA(source,{
  linea:2,cita:'IVA incluido',clase:'iva',estadoPropuesto:'incluido'
 }),{valida:true,estadoVerificado:'incluido'});
 assert.equal(validarEvidenciaIA(source,{
  linea:1,cita:'IVA incluido',clase:'iva',estadoPropuesto:'incluido'
 }).valida,false);
 assert.equal(validarEvidenciaIA(source,{
  linea:2,cita:'IVA incluido',clase:'iva',estadoPropuesto:'no_incluido'
 }).valida,false);
 assert.equal(validarEvidenciaIA(source,{
  linea:3,cita:'Flete gratis',clase:'flete',estadoPropuesto:'sin_cargo'
 }).valida,false);
});
test('MVP-006: no acepta alucinación IA aunque esté escrita en un campo válido',()=>{
 const source='El presupuesto no aclara impuestos';
 assert.equal(validarEvidenciaIA(source,{
  linea:1,cita:'El presupuesto no aclara impuestos',clase:'iva',estadoPropuesto:'incluido'
 }).valida,false);
 assert.equal(leerCondicionesPresupuesto(source).iva.estado,'no_informado');
});
test('MVP-006: fuente demasiado grande o con controles se rechaza',()=>{
 assert.throws(()=>leerCondicionesPresupuesto('x'.repeat(18001)),/aclaraciones_invalidas/);
 assert.throws(()=>leerCondicionesPresupuesto('IVA incluido\u0000'),/aclaraciones_invalidas/);
 assert.throws(()=>leerCondicionesPresupuesto('x\n'.repeat(161)),/demasiadas_aclaraciones/);
});
test('MVP-006: detecta que comprador pidió CON IVA y separa la aclaración de materiales',()=>{
 const text='20 bolsas Cemento CPC Loma Negra 50 kg\nNecesito presupuesto con IVA incluido\n5 litros pintura látex interior';
 const r=separarCondicionesComprador(text);
 assert.equal(r.iva,'con_iva');
 assert.deepEqual(r.materiales.map(x=>x.numero),[1,3]);
 assert.equal(r.lineasCondicion[0].numero,2);
 const view=generarVistaCompradorMvp(text);
 assert.equal(view.condicionIvaComprador,'con_iva');
 assert.equal(view.lineas,2);
 assert.equal(view.pendientes,0);
 assert.equal(view.invitaciones,2);
 assert.deepEqual(view.filas.map(x=>x.numero),[1,3]);
 assert.ok(view.proveedores.every(x=>x.mensajes.some(m=>
  m.includes('cotización CON IVA incluido en el importe final'))));
 assert.equal(view.mensajesEnviados,0);
});
test('MVP-006: condición explícita se transmite una sola vez por proveedor',()=>{
 const base=generarVistaCompradorMvp(EJEMPLO_PEDIDO_MVP);
 assert.equal(base.condicionIvaComprador,'no_especificado');
 assert.ok(base.proveedores.every(p=>p.mensajes.every(x=>!x.includes('IMPORTANTE: el comprador'))));
 const text='10 bolsas cemento\n20 bolsas Cemento CPC Loma Negra 50 kg\nCotizar con IVA incluido';
 const result=generarVistaCompradorMvp(text);
 // D015 may retain duplicates by product: either way should not duplicate conditions.
 assert.ok(result.proveedores.every(p=>
  p.mensajes.filter(x=>x.includes('IMPORTANTE: el comprador')).length<=1));
});
test('MVP-006: una mención casual de IVA en artículo no crea instrucción fiscal',()=>{
 const v=separarCondicionesComprador('10 bolsas cemento con IVA incluido');
 assert.equal(v.iva,'no_especificado');
 assert.equal(v.materiales.length,1);
});
test('MVP-006: instrucciones tributarias contradictorias no se transmiten como regla',()=>{
 const v=generarVistaCompradorMvp('10 bolsas cemento\nCon IVA\nSin IVA');
 assert.equal(v.condicionIvaComprador,'contradictorio');
 assert.match(v.avisoIva,/contradictorias/);
 assert.ok(v.proveedores.every(p=>p.mensajes.every(m=>!m.includes('IMPORTANTE: el comprador'))));
});
test('MVP-006: el flujo no se conecta al canal ni saltea consentimiento por el IVA solicitado',()=>{
 const v=generarVistaCompradorMvp('10 bolsas cemento\nCotización con IVA incluido');
 assert.equal(v.proveedores.length,1);
 assert.equal(v.proveedores[0].nombre,'Corralón de ejemplo');
 assert.equal(v.llamadasIA,0);
 assert.equal(v.mensajesEnviados,0);
 assert.equal(v.preciosReales,0);
 assert.ok(!JSON.stringify(v).includes('sin_opt_in_ficticio'));
 assert.ok(!JSON.stringify(v).includes('fuera_zona_ficticio'));
 assert.ok(!JSON.stringify(v).includes('baja_ficticio'));
});
test('MVP-006: solicitud sin materiales no inventa destinatarios',()=>{
 assert.throws(()=>generarVistaCompradorMvp('Necesito presupuesto con IVA incluido'),/pedido_sin_materiales/);
});
