import test from 'node:test';
import assert from 'node:assert/strict';
import {auditarCondicionesFuenteMvp167 as audit} from '../../src/domain/auditoria-condiciones-mvp167.ts';
const SHA='a'.repeat(64),HMAC='b'.repeat(64),REQUEST='ronda_mvp167';
const doc=()=>({
 requestId:REQUEST,anonId:'anon_prueba',sourceSha256:SHA,messageHmac:HMAC,
 declaredTotalLiteral:'$ 242,00',
 lineas:[{lineNo:1,descriptionLiteral:'25 bolsas cemento',
  quantityLiteral:'2',unitLiteral:'bolsa',unitPriceLiteral:'$ 100,00',
  lineTotalLiteral:'$ 242,00'}],
 prueba:{requestId:REQUEST,messageHmac:HMAC,sourceSha256:SHA,
  version:9,state:'verified',reason:'covered',lineCount:1,
  sumLineCents:'24200',declaredTotalCents:'24200',rankingAllowed:false,
  revisionVigente:true,cotizacionVigente:true}
});
const rows=(...notes)=>[
 {pagina:1,fila:1,texto:'2 cemento $100,00 $242,00'},
 {pagina:1,fila:2,texto:'TOTAL $242,00'},
 ...notes.map((texto,i)=>({pagina:1,fila:3+i,texto}))
];
const run=(...notes)=>audit(doc(),rows(...notes),SHA);
const noRanking=x=>{
 assert.equal(x.rankingHabilitado,false);
 assert.equal(x.netoSinIvaAcreditado,false);
 assert.equal(x.stockCorroborado,false);
 assert.equal(x.plazoCorroborado,false);
 assert.equal(x.minimoCompraCorroborado,false);
 assert.equal(x.originalesModificados,false);
 assert.equal(x.contactosRevelados,false);
};
test('MVP167: documento sin condiciones no inventa IVA, flete ni pago',()=>{
 const r=run();
 assert.equal(r.estado,'fuente_leida');
 assert.equal(r.iva.estado,'no_informado');
 assert.equal(r.iva.tasa,null);
 assert.equal(r.flete.estado,'no_informado');
 assert.equal(r.flete.importe,null);
 assert.equal(r.pago.estado,'no_informado');
 noRanking(r);
});
test('MVP167: IVA incluido 21% acredita declaración, no base imponible',()=>{
 const r=run('IVA incluido 21%');
 assert.equal(r.iva.estado,'incluido');
 assert.equal(r.iva.tasa,'21');
 assert.deepEqual(r.iva.ubicaciones,[{pagina:1,fila:3}]);
 noRanking(r);
});
test('MVP167: sin IVA no es IVA 0% ni IVA incluido',()=>{
 const r=run('Precios sin IVA');
 assert.equal(r.iva.estado,'no_incluido');
 assert.equal(r.iva.tasa,null);
 noRanking(r);
});
test('MVP167: IVA 21% sin cláusula incluido/excluido es tasa sin base',()=>{
 const r=run('IVA 21%');
 assert.equal(r.iva.estado,'tasa_sin_base');
 assert.equal(r.iva.tasa,'21');
 noRanking(r);
});
test('MVP167: tasa expresa 10,5% y 0% sin inferir alcance al resto',()=>{
 for(const [literal,tasa] of [['IVA incluido 10,5%','10.5'],['IVA incluido 0%','0']]){
  const r=run(literal);
  assert.equal(r.iva.estado,'incluido');
  assert.equal(r.iva.tasa,tasa);
  noRanking(r);
 }
});
test('MVP167: IVA incluido y excluido en notas distintas es contradictorio',()=>{
 const r=run('IVA incluido 21%','IVA no incluido 21%');
 assert.equal(r.iva.estado,'contradictorio');
 assert.equal(r.iva.tasa,null);
 assert.equal(r.iva.ubicaciones.length,2);
 noRanking(r);
});
test('MVP167: dos tasas de IVA distintas no se consolidan',()=>{
 const r=run('IVA incluido 21%','IVA incluido 10,5%');
 assert.equal(r.iva.estado,'contradictorio');
 assert.equal(r.iva.tasa,null);
});
test('MVP167: cláusula dudosa de IVA no acredita nada',()=>{
 for(const note of ['¿Incluye IVA?','Consultar si IVA incluido','IVA pendiente de confirmar']){
  const r=run(note);
  assert.equal(r.iva.estado,'no_informado',note);
 }
});
test('MVP167: flete sin cargo explícito no se confunde con flete desconocido',()=>{
 const r=run('Flete sin cargo');
 assert.equal(r.flete.estado,'sin_cargo');
 assert.equal(r.flete.importe,'0.00');
 assert.deepEqual(r.flete.ubicaciones,[{pagina:1,fila:3}]);
 noRanking(r);
});
test('MVP167: flete incluido solo acredita que no se agrega otro cargo',()=>{
 const r=run('Flete incluido');
 assert.equal(r.flete.estado,'incluido');
 assert.equal(r.flete.importe,'0.00');
 noRanking(r);
});
test('MVP167: flete adicional con importe argentino explícito',()=>{
 const r=run('Flete adicional: $1.250,50');
 assert.equal(r.flete.estado,'adicional_con_importe');
 assert.equal(r.flete.importe,'1250.50');
 noRanking(r);
});
test('MVP167: flete informado sin relación con total no autoriza doble sumarlo',()=>{
 const r=run('Flete: $500,00');
 assert.equal(r.flete.estado,'importe_sin_tratamiento');
 assert.equal(r.flete.importe,'500.00');
 noRanking(r);
});
test('MVP167: flete a convenir y flete aparte no significan cero',()=>{
 const r=run('Flete a convenir');
 assert.equal(r.flete.estado,'a_convenir');
 assert.equal(r.flete.importe,null);
 const s=run('No incluye flete');
 assert.equal(s.flete.estado,'adicional_sin_importe');
 assert.equal(s.flete.importe,null);
 noRanking(r);noRanking(s);
});
test('MVP167: flete incluido y adicional en notas diferentes da conflicto',()=>{
 const r=run('Flete incluido','Flete adicional: $800,00');
 assert.equal(r.flete.estado,'contradictorio');
 assert.equal(r.flete.importe,null);
});
test('MVP167: contado, transferencia y cuenta corriente 30 dias por separado',()=>{
 for(const [literal,state] of [
  ['Pago: contado','contado'],
  ['Forma de pago: transferencia','transferencia'],
  ['Condiciones de pago: cuenta corriente a 30 días','cuenta_corriente_30_dias']
 ]){
  const r=run(literal);
  assert.equal(r.pago.estado,state,literal);
  assert.deepEqual(r.pago.ubicaciones,[{pagina:1,fila:3}]);
 }
});
test('MVP167: pagos alternativos no se convierten en único pago comparable',()=>{
 const a=run('Pago: contado o transferencia');
 const b=run('Pago: contado','Pago: transferencia');
 assert.equal(a.pago.estado,'multiple');
 assert.equal(b.pago.estado,'multiple');
 noRanking(a);
});
test('MVP167: stock disponible textual no acredita stock real ni plaza de entrega',()=>{
 const r=run('Stock disponible','Entrega en 3 días','Pago: transferencia');
 assert.equal(r.stockCorroborado,false);
 assert.equal(r.plazoCorroborado,false);
 assert.equal(r.pago.estado,'transferencia');
});
test('MVP167: no inventa flete desde importe de un producto',()=>{
 const r=run('Cemento Portland $500,00','Flete pendiente de confirmar');
 assert.equal(r.flete.estado,'no_informado');
 assert.equal(r.flete.importe,null);
});
test('MVP167: documento, hash, version o revisión incorrectos fail closed',()=>{
 for(const patch of [
  {sourceSha256:'c'.repeat(64)},{version:8},{state:'needs_source_review'},
  {rankingAllowed:true},{revisionVigente:false},{cotizacionVigente:false}
 ]){
  const d=doc();d.prueba={...d.prueba,...patch};
  assert.equal(audit(d,rows('IVA incluido 21%'),SHA).estado,'fuente_no_acreditada');
 }
 assert.equal(audit(doc(),rows('IVA incluido 21%'),'c'.repeat(64)).estado,'fuente_no_acreditada');
});
test('MVP167: total desbalanceado o fila duplicada impiden atribuir términos',()=>{
 const d=doc();d.lineas[0].lineTotalLiteral='$ 241,00';
 assert.equal(audit(d,rows('Flete sin cargo'),SHA).estado,'fuente_no_acreditada');
 const r=rows('Flete sin cargo');r.push({...r[2]});
 assert.equal(audit(doc(),r,SHA).estado,'fuente_no_acreditada');
});
test('MVP167: ninguna respuesta expone textos, SHA, HMAC o datos de terceros',()=>{
 const d=doc(),r=rows('Pago: transferencia','IVA incluido 21%','Flete adicional: $500,00');
 const original=structuredClone(r);
 const out=audit(d,r,SHA),s=JSON.stringify(out);
 assert.deepEqual(r,original);
 assert.ok(!s.includes(SHA)&&!s.includes(HMAC)&&!s.includes(REQUEST));
 assert.ok(!s.includes('transferencia:')&&!s.includes('incluido 21'));
 assert.equal(out.iva.ubicaciones.length,1);
 noRanking(out);
});
test('MVP167: estados contradictorios DENTRO de una misma nota deben bloquear',()=>{
 const x=run('IVA incluido y no incluido 21%');
 const y=run('Flete sin cargo y flete adicional $500,00');
 assert.equal(x.iva.estado,'contradictorio');
 assert.equal(y.flete.estado,'contradictorio');
});
