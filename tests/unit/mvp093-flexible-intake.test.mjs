import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBuyerPilot,canPrepareBuyerPilot} from '../../supabase/functions/cotironda-piloto-whapi/core.ts';
const rows=[
 ['Entrega primero','Entrega: La Plata\n20 bolsas cemento CPC 50 kg\n5 litros hidrófugo'],
 ['Entrega después','20 bolsas de cemento CPC 50 kg\n5 litros hidrófugo\nEntrega: La Plata'],
 ['Ubicación al medio','20 bolsas cemento CPC 50 kg\nEntrega: La Plata\n5 litros hidrófugo'],
 ['Hola dos renglones','Hola!\nNecesito presupuesto\nEntrega: La Plata\n20 bolsas cemento CPC 50 kg\n5 litros hidrófugo'],
 ['Saludo y pedido juntos','Hola, necesito cotizar: 20 bolsas cemento CPC 50 kg\n5 litros hidrófugo\nEntrega: La Plata'],
 ['Bolsas abreviadas','Entrega: La Plata\n20 bols. cemento CPC 50 kg\n5 lts. hidrófugo'],
 ['Litros abreviados','Entrega: La Plata\n20 bolsas cemento CPC 50 kg\n5 l hidrófugo'],
 ['Cantidad a la derecha','Entrega: La Plata\nCemento CPC 50 kg - 20 bolsas\nHidrófugo: 5 litros'],
 ['Formato x cantidad','Entrega: La Plata\nCemento CPC 50 kg x 20 bolsas\nHidrófugo x 5 litros'],
 ['Separado por coma','20 bolsas cemento CPC 50 kg, 5 litros hidrófugo\nEntrega: La Plata'],
 ['Con y','20 bolsas cemento CPC 50 kg y 5 litros hidrófugo\nEntrega: La Plata'],
 ['Puntuación','20 bolsas cemento CPC 50 kg; 5 litros hidrófugo. Entrega: La Plata.'],
 ['Sin saludo, con destino','Destino: La Plata\n20 bolsas cemento CPC 50 kg\n5 litros hidrófugo'],
 ['La obra','Obra: La Plata\n20 bolsas cemento CPC 50 kg\n5 litros hidrófugo'],
 ['Entrega en','Entrega en La Plata\n20 bolsas cemento CPC 50 kg\n5 litros hidrófugo'],
 ['Tono informal','Buenas tardes!\nLes paso la lista para cotizar\n20 bolsas cemento CPC 50 kg\n5 litros hidrófugo\nEntrega: La Plata'],
 ['Texto en lista','Entrega: La Plata\n- 20 bolsas cemento CPC 50 kg\n- 5 litros hidrófugo'],
 ['Unidad en singular','Entrega: La Plata\n1 bolsa cemento CPC 50 kg\n1 litro hidrófugo'],
 ['Marca explicitada','Entrega: La Plata\n20 bolsas cemento Avellaneda CPC 50 kg\n5 litros hidrófugo'],
 ['Fecha expresa','Entrega: La Plata\nFecha de entrega: 10/11/2026\n20 bolsas cemento CPC 50 kg\n5 litros hidrófugo']
];
for(const [name,text] of rows){
 test('MVP093: interpreta variación '+name,()=>{
  const p=parseBuyerPilot(text);
  assert.equal(p.city,'La Plata');
  assert.equal(p.items.length,2,JSON.stringify(p));
  assert.deepEqual(p.items.map(x=>[x.quantity,x.unit,x.family]),[
   [name==='Unidad en singular'?1:20,'bag','cemento_gris_obra'],
   [name==='Unidad en singular'?1:5,'l','hidrofugo']
  ]);
  assert.deepEqual(p.unresolved,[],JSON.stringify(p));
  assert.equal(canPrepareBuyerPilot(p),true);
 });
}
test('MVP093: fecha de entrega explícita queda preservada, no confundirla con cierre',()=>{
 const p=parseBuyerPilot(rows.at(-1)[1]);
 assert.equal(p.deliveryNote,'10/11/2026');
 assert.equal(p.city,'La Plata');
});
test('MVP093: cantidades decimales no se rompen por la coma',()=>{
 const p=parseBuyerPilot('Entrega: La Plata\n1,5 litros hidrófugo\n3 bolsas cemento CPC 50 kg');
 assert.equal(p.items.length,2);
 assert.equal(p.items[0].quantity,1.5);
 assert.equal(canPrepareBuyerPilot(p),true);
});
test('MVP093: no inventa materiales de PDF sin texto ni de saludo',()=>{
 for(const raw of [
  'Hola, te adjunto un PDF', 'Buen día!', 'Necesito presupuesto',
  'Adjunto Excel de materiales', 'Te envío una foto del pedido'
 ]){
  const p=parseBuyerPilot(raw);assert.equal(canPrepareBuyerPilot(p),false,raw);
 }
});
test('MVP093: si un material no puede clasificarse, no se manda ningún subconjunto',()=>{
 const p=parseBuyerPilot('Entrega: La Plata\n10 bolsas cemento CPC 50 kg\n6 artefactos eléctricos marca X');
 assert.equal(p.items.length,1);assert.equal(p.unresolved.length,1);
 assert.equal(canPrepareBuyerPilot(p),false);
});
test('MVP093: ubicaciones contradictorias requieren aclaración',()=>{
 const p=parseBuyerPilot('Entrega: La Plata\nEntrega: Berisso\n20 bolsas cemento CPC 50 kg');
 assert.equal(canPrepareBuyerPilot(p),false);
 assert.ok(p.unresolved.includes('conflicting_delivery_locations'));
});
test('MVP093: fecha no deducible no se inventa y se conserva literal',()=>{
 const p=parseBuyerPilot('Entrega: La Plata\nFecha de entrega: viernes\n5 litros hidrófugo');
 assert.equal(p.deliveryNote,'viernes');
 assert.equal(canPrepareBuyerPilot(p),true);
});
