import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {capturarPresupuestoOriginalMvp063 as capturar,
 separarAlcancePresupuestoMvp063 as distribuir}
 from '../../src/domain/presupuesto-original-fiel-mvp063.ts';

const ORIG=[
 'PRESUPUESTO CORRALÓN - Validez 7 días',
 '20 bolsas cemento CPC 50 kg x $ 9.500,00 = $ 190.000,00',
 '2 pallets vacíos $ 7.000,00',
 '3 bolsones vacíos $ 1.500,00',
 'Flete a obra $ 12.000,00',
 'Descuento comercial -$ 3.000,00',
 'TOTAL FINAL: $ 217.500,00',
 'Aclaración: pallets y bolsones se retiran con cargo.',
 ' ',
 ''
].join('\r\n');

test('MVP063: preserva ABSOLUTAMENTE todas las líneas, extras, orden, espacios y saltos CRLF',()=>{
 const quote=capturar(ORIG);
 assert.equal(quote.textoOriginal,ORIG);
 assert.equal(quote.renglones.length,10);
 assert.deepEqual(quote.renglones.map(x=>x.textoExacto),ORIG.split('\r\n'));
 assert.equal(quote.renglones[1].textoExacto,
  '20 bolsas cemento CPC 50 kg x $ 9.500,00 = $ 190.000,00');
 assert.deepEqual(quote.renglones[1].importesLiterales,
  ['$ 9.500,00','$ 190.000,00']);
 assert.equal(quote.renglones[2].textoExacto,'2 pallets vacíos $ 7.000,00');
 assert.equal(quote.renglones[3].textoExacto,'3 bolsones vacíos $ 1.500,00');
 assert.equal(quote.renglones[5].textoExacto,'Descuento comercial -$ 3.000,00');
 assert.equal(quote.renglones[6].textoExacto,'TOTAL FINAL: $ 217.500,00');
 assert.equal(quote.sha256,createHash('sha256').update(ORIG,'utf8').digest('hex'));
 assert.equal(quote.fuenteSoloTexto,true);
 assert.equal(quote.comparacion,'requiere_conciliacion_independiente');
 assert.equal(Object.isFrozen(quote.renglones),true);
 assert.equal(Object.isFrozen(quote.renglones[2]),true);
});
test('MVP063: TOTAL declarado se guarda LITERAL y jamás se recalcula ni sustituye',()=>{
 const quote=capturar(ORIG);
 assert.deepEqual(quote.totalDeclarado,{
  numeroLinea:7,lineaExacta:'TOTAL FINAL: $ 217.500,00',
  importeLiteral:'$ 217.500,00',moneda:'ARS',
  importeDecimal:'217500.00'
 });
 assert.equal(quote.estadoTotal,'explicitamente_verificado');
 const other=capturar('1 cemento $ 10,00\n1 pallet vacío $ 8,00\nTOTAL: $ 999,00');
 assert.equal(other.totalDeclarado.importeDecimal,'999.00');
 assert.equal(other.totalDeclarado.importeLiteral,'$ 999,00');
 assert.equal(other.comparacion,'requiere_conciliacion_independiente');
});
test('MVP063: extras NO pedidos quedan visibles y clasificados, total sigue intacto',()=>{
 const quote=capturar(ORIG);
 const result=distribuir(quote,[
  {numeroLinea:2,alcance:'solicitado'},
  {numeroLinea:3,alcance:'no_solicitado'},
  {numeroLinea:4,alcance:'no_solicitado'},
  {numeroLinea:5,alcance:'cargo'},
  {numeroLinea:6,alcance:'descuento'}
 ]);
 assert.equal(result.solicitados.length,1);
 assert.deepEqual(result.noSolicitados.map(x=>x.numero),[3,4]);
 assert.equal(result.cargos[0].textoExacto,'Flete a obra $ 12.000,00');
 assert.equal(result.descuentos[0].textoExacto,'Descuento comercial -$ 3.000,00');
 assert.deepEqual(result.noClasificados.map(x=>x.numero),[1,7,8,9,10]);
 assert.equal(result.totalDeclarado.importeLiteral,'$ 217.500,00');
 // No class may erase a source line.
 const all=[...result.solicitados,...result.noSolicitados,...result.cargos,
  ...result.descuentos,...result.noClasificados].sort((a,b)=>a.numero-b.numero);
 assert.deepEqual(all,quote.renglones);
});
test('MVP063: texto sin total explícito no recibe TOTAL fabricado',()=>{
 const q=capturar('20 bolsas cemento $ 100,00\n2 pallets $ 40,00\nFlete a convenir');
 assert.equal(q.totalDeclarado,null);
 assert.equal(q.estadoTotal,'no_detectado');
 assert.equal(q.renglones.length,3);
});
test('MVP063: total repetido, parcial, con cifras contradictorias o ambiguas bloquea total único',()=>{
 for(const text of [
  'TOTAL: $ 1.000,00\nTOTAL: $ 2.000,00',
  'Subtotal: $ 700,00\nTOTAL: $ 1.200',
  'TOTAL: $ 12.100',
  'TOTAL: $ 1,200',
  'Total estimado: $ 900,00',
  'TOTAL: $ 100,00\nTOTAL EN USD 200',
  'Total $ 120,00 IVA o total con IVA a determinar'
 ]){
  const q=capturar(text);
  assert.equal(q.totalDeclarado,null,text);
  assert.equal(q.estadoTotal,'ambiguo_no_verificado',text);
  assert.equal(q.textoOriginal,text);
 }
});
test('MVP063: centavos y miles de estilo argentino o decimal inglés solo cuando inequívocos',()=>{
 const cases=[
  ['TOTAL: $ 19.500,70','19500.70'],
  ['Total final: $1,550.25','1550.25'],
  ['importe total = $ 1578,50','1578.50'],
  ['TOTAL: $ 121.00','121.00'],
  ['Total a pagar: $ 0,09','0.09'],
  ['TOTAL $ 1500','1500.00']
 ];
 for(const [source,expected] of cases){
  const q=capturar(source);
  assert.equal(q.totalDeclarado?.importeDecimal,expected,source);
 }
});
test('MVP063: frases IVA, flete sin aclarar, descuentos y notas se conservan sin interpretarlas',()=>{
 const s='20 bolsas cemento $9.000\nIVA según condición\n2 pallets en préstamo\nFlete a convenir\nNOTA: total sujeto a descarga';
 const q=capturar(s);
 assert.equal(q.renglones.length,5);
 assert.equal(q.renglones[2].textoExacto,'2 pallets en préstamo');
 assert.equal(q.renglones[4].textoExacto,'NOTA: total sujeto a descarga');
 assert.equal(q.estadoTotal,'no_detectado');
});
test('MVP063: rotulado de alcance no permite líneas inventadas ni duplicadas',()=>{
 const q=capturar('10 bolsas cemento $1.000,00\n1 bolson vacío $100,00');
 for(const annotations of [
  [{numeroLinea:3,alcance:'no_solicitado'}],
  [{numeroLinea:1,alcance:'solicitado'},{numeroLinea:1,alcance:'cargo'}],
  [{numeroLinea:1,alcance:'incorrecto'}],
  [{numeroLinea:0,alcance:'solicitado'}]
 ]){
  assert.throws(()=>distribuir(q,annotations),/mvp063_fuente_original_invalida/);
 }
});
test('MVP063: entradas adversarias, gigantes y control no se aceptan en cita de texto',()=>{
 for(const value of ['', 'a'.repeat(18001), 'precio\u0000inseguro',
  Array(351).fill('línea').join('\n'),null]){
  assert.throws(()=>capturar(value),/mvp063_fuente_original_invalida/);
 }
});
