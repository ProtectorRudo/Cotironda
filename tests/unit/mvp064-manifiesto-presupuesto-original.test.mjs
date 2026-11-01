import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {capturarPresupuestoOriginalMvp063}
 from '../../src/domain/presupuesto-original-fiel-mvp063.ts';
import {prepararManifiestoOriginalD093}
 from '../../src/server/whapi-quote-original-manifest-d093.ts';
import {interpretarCotizacionSimpleD063}
 from '../../src/server/whapi-quote-simple-interpreter-d063.ts';

const source=[
 '20 bolsas cemento CPC 50 kg $ 9500,00',
 '2 pallets vacíos $ 7000,00',
 '3 bolsones vacíos $ 1500,00',
 'Flete $ 12000,00',
 'Descuento: -$ 3000,00',
 'TOTAL FINAL: $ 217.500,00'
].join('\n');
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
test('MVP064: precio cemento puede interpretarse sin eliminar extras en la FUENTE íntegra',async()=>{
 const proposal=await interpretarCotizacionSimpleD063(source,[
  {itemId:'cemento_001',line_no:1,unit:'bag'}
 ]);
 assert.equal(proposal?.items.length,1);
 assert.equal(proposal?.items[0].precioInformado,'9500.00');
 const original=capturarPresupuestoOriginalMvp063(source);
 assert.deepEqual(original.renglones.map(x=>x.textoExacto),source.split('\n'));
 assert.equal(original.renglones[1].textoExacto,'2 pallets vacíos $ 7000,00');
 assert.equal(original.renglones[2].textoExacto,'3 bolsones vacíos $ 1500,00');
 assert.equal(original.renglones[4].textoExacto,'Descuento: -$ 3000,00');
 assert.equal(original.totalDeclarado?.importeLiteral,'$ 217.500,00');
});
test('MVP064: manifest SHA del texto EXACTO, incluidas líneas no solicitadas y total',()=>{
 const m=prepararManifiestoOriginalD093(source);
 assert.equal(m.source_text_sha256,sha(source));
 assert.equal(m.source_bytes,Buffer.byteLength(source,'utf8'));
 assert.equal(m.source_lines,6);
 assert.equal(m.total_status,'explicitamente_verificado');
 assert.deepEqual(m.total_source,{
  line_no:6,literal_sha256:sha('$ 217.500,00')
 });
 const changed=prepararManifiestoOriginalD093(source.replace('2 pallets','3 pallets'));
 assert.notEqual(changed.source_text_sha256,m.source_text_sha256);
 assert.deepEqual(changed.total_source,m.total_source);
});
test('MVP064: CRLF y espacios alteran hash, no se normalizan ni inventa precio',()=>{
 const linux=prepararManifiestoOriginalD093(source);
 const win=prepararManifiestoOriginalD093(source.replaceAll('\n','\r\n'));
 const spaces=prepararManifiestoOriginalD093(' '+source);
 assert.notEqual(win.source_text_sha256,linux.source_text_sha256);
 assert.notEqual(spaces.source_text_sha256,linux.source_text_sha256);
 assert.equal(win.source_lines,linux.source_lines);
 assert.equal(win.total_source.literal_sha256,linux.total_source.literal_sha256);
});
test('MVP064: fuente con total incongruente permanece declarada, no cambia el monto',()=>{
 const altered=source.replace('$ 217.500,00','$ 999.999,99');
 const m=prepararManifiestoOriginalD093(altered);
 assert.equal(m.total_status,'explicitamente_verificado');
 assert.equal(m.total_source?.literal_sha256,sha('$ 999.999,99'));
 const original=capturarPresupuestoOriginalMvp063(altered);
 assert.equal(original.totalDeclarado?.importeDecimal,'999999.99');
 assert.equal(original.comparacion,'requiere_conciliacion_independiente');
});
test('MVP064: TOTAL ambiguo y faltante no se atribuye al proveedor por inferencia',()=>{
 const ambiguous=prepararManifiestoOriginalD093(source+'\nTOTAL GENERAL: $ 200.000,00');
 assert.equal(ambiguous.total_status,'ambiguo_no_verificado');
 assert.equal(ambiguous.total_source,null);
 const absent=prepararManifiestoOriginalD093(source.replace(/TOTAL FINAL:.*/u,''));
 assert.equal(absent.total_status,'no_detectado');
 assert.equal(absent.total_source,null);
});
test('MVP064: límite estricto evita guardar constancia de texto no validable',()=>{
 for(const raw of ['', 'x'.repeat(9000),
   Array(161).fill('texto de origen').join('\n'),'texto\u0000extraño']){
  assert.throws(()=>prepararManifiestoOriginalD093(raw),
   /d093_manifiesto_original_invalido/);
 }
});
