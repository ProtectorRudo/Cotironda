import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {auditarCotizacionTextoMvp075 as auditar}
 from '../../src/domain/auditoria-cotizacion-texto-mvp075.ts';

const COTIZACION_PILOTO=[
 'PRESUPUESTO DE PRUEBA',
 '20 bolsas cemento CPC 50 kg: $180.000',
 '5 litros hidrófugo: $35.000',
 'TOTAL: $215.000',
 'Valores ficticios para ensayo.'
].join('\n');

const DETALLE=[
 'COTIZACIÓN FIEL',
 '20 bolsas cemento CPC 50 kg x $ 9.500,00 = $ 190.000,00',
 '5 litros hidrófugo x $ 4.200,00 = $ 21.000,00',
 '2 pallets vacíos x $ 7.000,00 = $ 14.000,00',
 'Flete: $ 12.000,00',
 'Descuento: -$ 3.000,00',
 'TOTAL FINAL: $ 234.000,00',
 'IVA: no informado',
 ''
].join('\r\n');

test('MVP075: caso real de Ailín muestra 5 líneas intactas y NO normaliza $215.000 por intuición',()=>{
 const result=auditar(COTIZACION_PILOTO);
 assert.equal(result.fuenteOriginal,COTIZACION_PILOTO);
 assert.equal(result.sha256,createHash('sha256').update(COTIZACION_PILOTO).digest('hex'));
 assert.deepEqual(result.lineas.map(x=>x.textoExacto),COTIZACION_PILOTO.split('\n'));
 assert.equal(result.totalDeclaradoLiteral,'$215.000');
 assert.equal(result.estadoTotal,'ambiguo_no_verificado');
 assert.equal(result.totalDecimalVerificado,null);
 assert.equal(result.sumaObservada,null);
 assert.equal(result.estadoConciliacion,'no_verificable');
 assert.equal(result.estadoIva,'no_aclarado');
 assert.equal(result.estadoFlete,'no_informado');
 assert.equal(result.rankingHabilitado,false);
 assert.equal(result.adjudicacion,false);
 assert.equal(result.enviosWhatsapp,0);
 assert.ok(result.lineas[1].importesLiterales.includes('$180.000'));
});

test('MVP075: descuentos, pallets y flete verificados con centavos; suma no altera TOTAL ni fuente',()=>{
 const result=auditar(DETALLE);
 assert.equal(result.fuenteOriginal,DETALLE);
 assert.equal(result.lineas.length,9);
 assert.equal(result.lineas[3].tipo,'embalaje');
 assert.equal(result.lineas[4].tipo,'flete');
 assert.equal(result.lineas[5].tipo,'descuento');
 assert.equal(result.lineas[3].importeVerificable,'14000.00');
 assert.equal(result.lineas[5].importeVerificable,'-3000.00');
 assert.equal(result.estadoFlete,'monto_explicito');
 assert.equal(result.estadoIva,'no_aclarado');
 assert.equal(result.estadoTotal,'explicitamente_verificado');
 assert.equal(result.totalDeclaradoLiteral,'$ 234.000,00');
 assert.equal(result.totalDecimalVerificado,'234000.00');
 assert.equal(result.sumaObservada,'234000.00');
 assert.equal(result.estadoConciliacion,'cuadra_suma_observada');
 assert.deepEqual(result.lineas.map(l=>l.textoExacto),DETALLE.split('\r\n'));
 assert.equal(Object.isFrozen(result.lineas),true);
 assert.equal(Object.isFrozen(result.lineas[3]),true);
 assert.equal(result.rankingHabilitado,false);
});

test('MVP075: diferencia entre suma y total declarado se señala sin corregir precio original',()=>{
 const texto=DETALLE.replace('$ 234.000,00','$ 235.000,00');
 const result=auditar(texto);
 assert.equal(result.estadoConciliacion,'diferencia_detectada');
 assert.equal(result.sumaObservada,'234000.00');
 assert.equal(result.totalDeclaradoLiteral,'$ 235.000,00');
 assert.equal(result.totalDecimalVerificado,'235000.00');
 assert.equal(result.fuenteOriginal,texto);
});

test('MVP075: multiplicación falsa NO se convierte en precio verificable',()=>{
 const texto='2 pallets vacíos x $ 7.000,00 = $ 15.000,00\nTOTAL: $ 15.000,00';
 const result=auditar(texto);
 assert.equal(result.lineas[0].estado,'aritmetica_incorrecta');
 assert.equal(result.estadoConciliacion,'no_verificable');
 assert.equal(result.sumaObservada,null);
});

test('MVP075: una línea con dos montos sin relación x/= NO se asume como total',()=>{
 const result=auditar('cemento $ 100,00 y flete $ 20,00\nTOTAL: $ 120,00');
 assert.equal(result.lineas[0].importeVerificable,null);
 assert.equal(result.estadoConciliacion,'no_verificable');
});

test('MVP075: $12.100, USD y totales duplicados nunca generan conciliación falsa',()=>{
 for(const text of [
  'Cemento: $12.100\nTOTAL: $12.100',
  'Cemento: $ 100,00 USD\nTOTAL: $ 100,00',
  'Cemento: $ 100,00\nTOTAL: $ 100,00\nTOTAL: $ 100,00',
  'Cemento: $ 100,00\nSUBTOTAL: $ 100,00\nTOTAL: $ 100,00'
 ]){
  const result=auditar(text);
  assert.equal(result.estadoConciliacion,'no_verificable',text);
  assert.equal(result.rankingHabilitado,false);
 }
});

test('MVP075: flete a convenir o contradictorio impide conciliación aun con total que cuadra',()=>{
 for(const freight of ['Flete a convenir','Flete incluido\nFlete a convenir']){
  const result=auditar('Cemento: $ 100,00\n'+freight+'\nTOTAL: $ 100,00');
  assert.equal(result.estadoConciliacion,'no_verificable');
  assert.equal(result.estadoFlete,freight.includes('incluido')?'contradictorio':'a_convenir');
 }
});

test('MVP075: IVA explícito y contradictorio se anotan, jamás se inventa 21% ni ranking',()=>{
 assert.equal(auditar('Cemento: $ 100,00\nIVA incluido\nTOTAL: $ 100,00').estadoIva,'incluido_explicito');
 assert.equal(auditar('Cemento: $ 100,00\nSin IVA\nTOTAL: $ 100,00').estadoIva,'excluido_explicito');
 const contra=auditar('Cemento: $ 100,00\nCon IVA\nSin IVA\nTOTAL: $ 100,00');
 assert.equal(contra.estadoIva,'contradictorio');
 assert.equal(contra.rankingHabilitado,false);
});

test('MVP075: líneas extra aunque no sean pedidos y observaciones monetarias nunca desaparecen',()=>{
 const texto='Cemento: $ 100,00\nPallet vacío: $ 20,00\nNota: descuento sujeto a $ 10,00\nTOTAL: $ 120,00';
 const result=auditar(texto);
 assert.equal(result.lineas.length,4);
 assert.equal(result.lineas[1].tipo,'embalaje');
 assert.equal(result.lineas[2].tipo,'nota');
 assert.equal(result.estadoConciliacion,'no_verificable');
 assert.equal(result.fuenteOriginal,texto);
});

test('MVP075: fuente inválida o demasiado larga bloqueada sin tocar sistemas reales',()=>{
 for(const source of ['', 'x'.repeat(18001), 'texto\u0000inválido',null]){
  assert.throws(()=>auditar(source),/mvp063_fuente_original_invalida/);
 }
 const code=readFileSync(new URL('../../src/domain/auditoria-cotizacion-texto-mvp075.ts',import.meta.url),'utf8');
 assert.doesNotMatch(code,/fetch\(|Deno\.env|supabase\.co|gate\.whapi\.cloud|api\.openai\.com/);
});
