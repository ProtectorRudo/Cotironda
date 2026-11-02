import test from 'node:test';
import assert from 'node:assert/strict';
import {capturarPresupuestoOriginalMvp063 as capturar}
 from '../../src/domain/presupuesto-original-fiel-mvp063.ts';
import {construirPlantillaAnonimaMvp088 as construir}
 from '../../src/domain/plantilla-anonima-piloto-mvp088.ts';

const quote=[
 'Comercio Ejemplo S.A. - CUIT 30-12345678-9',
 '20 bolsas cemento CPC 50 kg x $ 9.500,00 = $ 190.000,00',
 '2 pallets vacíos $ 7.000,00',
 '3 bolsones vacíos $ 1.500,00',
 'Flete a obra $ 12.000,00',
 'Descuento comercial -$ 3.000,00',
 'TOTAL FINAL: $ 217.500,00',
 'Entrega hasta 72 horas',
 ''
].join('\r\n');
const clases=['identidad','solicitado','adicional','adicional','flete',
 'descuento','total','condicion','sin_clasificar'];
const etiquetas=()=>clases.map((clase,i)=>({numeroLinea:i+1,clase}));
const entrada=(texto=quote)=>({
 fuente:capturar(texto),anonId:'anon_a',revisadoPorServidorConfiable:true,
 etiquetas:etiquetas()
});
test('MVP088: copia comercial 100% fiel preserva pallets, bolsones, flete, descuento y TOTAL literal',()=>{
 const x=entrada();
 const y=construir(x);
 assert.equal(y.proveedorAnonimo,'anon_a');
 assert.equal(y.renglonesFuente,9);
 assert.equal(y.renglonesIdentidadRetenidos,1);
 assert.deepEqual(y.renglones.map(z=>z.numeroLinea),[2,3,4,5,6,7,8,9]);
 assert.deepEqual(y.renglones.map(z=>z.textoExacto),
  x.fuente.renglones.slice(1).map(z=>z.textoExacto));
 assert.deepEqual(y.renglones[0].importesLiterales,['$ 9.500,00','$ 190.000,00']);
 assert.ok(y.renglones.some(z=>z.textoExacto.includes('pallets vacíos')));
 assert.ok(y.renglones.some(z=>z.textoExacto.includes('bolsones vacíos')));
 assert.ok(y.renglones.some(z=>z.textoExacto.includes('Flete')));
 assert.ok(y.renglones.some(z=>z.textoExacto.includes('Descuento')));
 assert.deepEqual(y.totalDeclarado,{importeLiteral:'$ 217.500,00',lineaFuente:7});
 assert.equal(y.sha256Fuente,x.fuente.sha256);
 assert.equal(y.comparacionEconomica,'pendiente_conciliacion');
 assert.equal(y.contactosRevelados,false);
 assert.equal(y.archivoOriginalExpuesto,false);
 assert.doesNotMatch(JSON.stringify(y),/Comercio Ejemplo|CUIT|30-12345678-9/);
});
test('MVP088: total original equivocado NO se recalcula ni se reemplaza',()=>{
 const s='Corralón ABC\n1 bolsa cemento $ 100,00\n1 pallet vacío $ 20,00\nTOTAL: $ 987,00';
 const result=construir({
  fuente:capturar(s),anonId:'anon_b',
  revisadoPorServidorConfiable:true,
  etiquetas:['identidad','solicitado','adicional','total']
   .map((clase,i)=>({numeroLinea:i+1,clase}))
 });
 assert.equal(result.totalDeclarado?.importeLiteral,'$ 987,00');
 assert.ok(result.renglones.some(r=>r.textoExacto==='1 pallet vacío $ 20,00'));
});
test('MVP088: sin TOTAL explícito devuelve no informado, nunca inventa uno',()=>{
 const s='10 bolsas cemento $ 100,00\nFlete a convenir';
 const result=construir({
  fuente:capturar(s),anonId:'anon_c',
  revisadoPorServidorConfiable:true,
  etiquetas:[{numeroLinea:1,clase:'solicitado'},{numeroLinea:2,clase:'condicion'}]
 });
 assert.equal(result.totalDeclarado,null);
 assert.equal(result.estadoTotal,'no_detectado');
});
test('MVP088: no se permite ocultar renglones con importes bajo la categoría identidad',()=>{
 const x=entrada();
 for(const line of [2,3,4,5,6,7]){
  const tags=etiquetas();
  tags[line-1]={numeroLinea:line,clase:'identidad'};
  assert.throws(()=>construir({...x,etiquetas:tags}),
   /mvp088_presupuesto_no_publicable/,String(line));
 }
});
test('MVP088: no publica números de contacto, direcciones ni correos en líneas públicas',()=>{
 const inputs=[
  'Consulta a 221 555 9999',
  'Email: ventas@corralon.com',
  'WhatsApp +54 9 221 555 9999',
  'Razón social: Casa de materiales',
  'Corralón Calle: www.ejemplo.com',
  'Flete $ 9.000,00, tel 221 333 4444'
 ];
 for(const contact of inputs){
  const fuente=capturar('1 bolsa cemento $ 100,00\n'+contact);
  assert.throws(()=>construir({
   fuente,anonId:'anon_d',revisadoPorServidorConfiable:true,
   etiquetas:[{numeroLinea:1,clase:'solicitado'},{numeroLinea:2,clase:'condicion'}]
  }),/mvp088_presupuesto_no_publicable/,contact);
 }
});
test('MVP088: exige clasificación completa, sin duplicados, procedencia real y confianza servidor',()=>{
 const x=entrada();
 const bad=[
  {...x,etiquetas:etiquetas().slice(0,-1)},
  {...x,etiquetas:[...etiquetas().slice(0,-1),{numeroLinea:1,clase:'total'}]},
  {...x,etiquetas:etiquetas().map((a,i)=>i===3?{...a,clase:'invalida'}:a)},
  {...x,anonId:'corralon_ailin'},
  {...x,revisadoPorServidorConfiable:false},
  {...x,telefono:'2215551111'},
  {...x,fuente:{...x.fuente,sha256:'0'.repeat(64)}},
  {...x,fuente:{...x.fuente,renglones:x.fuente.renglones.slice(0,-1)}}
 ];
 for(const value of bad)assert.throws(()=>construir(value),
  /mvp088_presupuesto_no_publicable/);
});
test('MVP088: no se convierte en permiso de enviar WhatsApp ni de revelar identidad',()=>{
 const x=construir(entrada());
 assert.equal(Object.isFrozen(x),true);
 assert.equal(Object.isFrozen(x.renglones),true);
 assert.equal(Object.isFrozen(x.renglones[0]),true);
 assert.equal('to' in x,false);
 assert.equal('phone' in x,false);
 assert.equal('contacto' in x,false);
 assert.equal('envioWhatsapp' in x,false);
});
