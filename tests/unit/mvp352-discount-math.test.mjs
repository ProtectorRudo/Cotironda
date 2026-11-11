import test from 'node:test';
import assert from 'node:assert/strict';
import {comprobarDescuentoUnitarioMvp352}
 from '../../supabase/functions/cotironda-piloto-whapi/supplier-discount-arithmetic-mvp352.ts';

const read=(description,quantity,unit_price,line_total)=>
 comprobarDescuentoUnitarioMvp352({
  original_description:description,quantity,unit_price,line_total
 });
test('MVP352 discount: price-list unit -> discount -> rounded effective unit -> extended total',()=>{
 const lines=[
  ['Cemento; Dscto. 22.4%','15,00','$100,07','$1.164,75','$77.65'],
  ['BIG BAG de Arena; Dscto. 22.4%','2,00','$70,83','$109,94','$54.97'],
  ['BIG BAG de Piedra; Dscto. 22.4%','1,00','$109,22','$84,75','$84.75']
 ];
 for(const [name,quantity,unit,listTotal,netUnit] of lines){
  const r=read(name,quantity,unit,listTotal);
  assert.equal(r.state,'consistent',name);
  assert.equal(r.inferred_effective_unit_price,netUnit);
  assert.equal(r.source_verified,false);
  assert.equal(r.publication_allowed,false);
 }
});
test('MVP352 discount: unit rounding differs from discounting whole line, never accept inconsistent total',()=>{
 const correct=read('Cemento; Dscto. 22.4%','15','$100,07','$1.164,75');
 const wrong=read('Cemento; Dscto. 22.4%','15','$100,07','$1.164,81');
 assert.equal(correct.state,'consistent');
 assert.equal(wrong.state,'inconsistent');
 assert.equal(wrong.checked_extended_total,'$1164.75');
 assert.equal(wrong.publication_allowed,false);
});
test('MVP352 discount: decimal-comma, 100%, unmentioned discounts, freight and ambiguous tokens fail closed',()=>{
 for(const entry of [
  ['Cemento; Dscto. 22.4%','15','17.024,70','$198.167,55'],
  ['Cemento; Dscto. 22.4%','15','$17.024,70',null],
  ['Cemento; Dscto. 100%','1','$100,00','$0,00'],
  ['Cemento; Dscto. 101%','1','$100,00','$99,00'],
  ['Cemento 22.4% de concentración','1','$100,00','$77,60'],
  ['Cemento; Dscto. 22.4%; Flete a convenir','1','$100,00','$77,60'],
  ['Cemento; Dscto. 22.4%','0','$100,00','$77,60'],
  ['Cemento; Dscto. 22.4%','-2','$100,00','$77,60'],
  ['Cemento; Dscto. 22.4%','1','$1000.000,00','$776.000,00'],
  ['Cemento; Dscto. 22.4%','1','$100,00','$77,6001']
 ])assert.equal(read(...entry).state,'not_evaluable',entry.join(' | '));
});
test('MVP352 discount: original untouched even after detection',()=>{
 const source={
  original_description:'Membrana hidro; descuento 12,5%',
  quantity:'1,500',unit_price:'$120,00',line_total:'$157,50',
  iva:'no informado',flete:'a convenir'
 };
 const frozen=JSON.parse(JSON.stringify(source));
 const diagnostic=comprobarDescuentoUnitarioMvp352(source);
 assert.equal(diagnostic.state,'consistent');
 assert.equal(diagnostic.inferred_effective_unit_price,'$105.00');
 assert.equal(diagnostic.checked_extended_total,'$157.50');
 assert.deepEqual(source,frozen);
 assert.equal(diagnostic.source_verified,false);
 assert.equal(diagnostic.publication_allowed,false);
});
test('MVP352 discount: even matching line arithmetic does not authorize PDF or economic publication',()=>{
 const r=read('Pintura; bonificación 20%','3','$250,00','$600,00');
 assert.equal(r.state,'consistent');
 assert.equal(r.source_verified,false);
 assert.equal(r.publication_allowed,false);
});
