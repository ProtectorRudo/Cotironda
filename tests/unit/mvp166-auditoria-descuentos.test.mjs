import test from 'node:test';
import assert from 'node:assert/strict';
import {auditarDescuentosFuenteMvp166 as auditar} from '../../src/domain/auditoria-descuentos-mvp166.ts';

const SHA='a'.repeat(64),HMAC='b'.repeat(64),REQ='ronda_prueba';
const descriptions=['BIG BAG de Arena','BIG BAG de Piedra','cemento avellaneda x 25 kg'];
const cantidades=['1,00','2,00','25,00'];
const precios=['$1.000,00','$1.000,00','$100,00'];
const rows=(discount='22,4',amounts=['$776,00','$1.552,00','$1.940,00'])=>[
 {pagina:1,fila:1,texto:'ITEM CANT DESCRIPCION DSCTO SUBTOTAL'},
 ...descriptions.map((name,i)=>({
  pagina:1,fila:i+2,
  texto:cantidades[i]+' '+name+' '+precios[i]+' '+discount+'% '+amounts[i]
 })),
 {pagina:1,fila:5,texto:'TOTAL $4.268,00'}
];
const doc=(amounts=['$776,00','$1.552,00','$1.940,00'],discount='22.4')=>({
 requestId:REQ,anonId:'anon_prueba',messageHmac:HMAC,sourceSha256:SHA,
 declaredTotalLiteral:'$4.268,00',
 lineas:descriptions.map((name,i)=>({
  lineNo:i+1,descriptionLiteral:name+'; Dscto. '+discount+'%',
  quantityLiteral:cantidades[i],unitLiteral:null,unitPriceLiteral:precios[i],
  lineTotalLiteral:amounts[i]
 })),
 prueba:{requestId:REQ,messageHmac:HMAC,sourceSha256:SHA,
  version:9,state:'verified',reason:'covered',lineCount:3,
  sumLineCents:'426800',declaredTotalCents:'426800',
  rankingAllowed:false,revisionVigente:true,cotizacionVigente:true}
});
const sinIVA=r=>assert.ok(r.precios.every(x=>x.ivaAcreditado===false));

test('MVP166: 3 descuentos 22,4% de PDF fuente con importes Ailín representativos',()=>{
 const d=doc(),original=structuredClone(d),source=rows(),originalRows=structuredClone(source);
 const r=auditar(d,source,SHA);
 assert.deepEqual(d,original);assert.deepEqual(source,originalRows);
 assert.equal(r.estado,'descuentos_conciliados_sin_iva');
 assert.deepEqual(r.precios.map(x=>x.descuentoPorcentaje),['22.40','22.40','22.40']);
 assert.deepEqual(r.precios.map(x=>x.unitarioComercialTrasDescuento),['776.00','776.00','77.60']);
 assert.deepEqual(r.precios.map(x=>[x.pagina,x.fila]),[[1,2],[1,3],[1,4]]);
 sinIVA(r);
 assert.equal(r.rankingHabilitado,false);assert.equal(r.originalesModificados,false);
 assert.equal(r.contactosRevelados,false);
 assert.ok(!JSON.stringify(r).includes(SHA));
 assert.ok(!JSON.stringify(r).includes(HMAC));
});
test('MVP166: cero descuento explícito de Nahuel es diferente a IVA cero',()=>{
 const a=['$1.000,00','$2.000,00','$2.500,00'];
 const d=doc(a,'0.0');
 d.declaredTotalLiteral='$5.500,00';
 d.prueba.sumLineCents='550000';d.prueba.declaredTotalCents='550000';
 const source=rows('0,0',a);source[4].texto='TOTAL $5.500,00';
 const r=auditar(d,source,SHA);
 assert.equal(r.estado,'descuentos_conciliados_sin_iva');
 assert.deepEqual(r.precios.map(x=>x.descuentoPorcentaje),['0.00','0.00','0.00']);
 sinIVA(r);
});
test('MVP166: lista sin descuento con aritmética exacta no inventa descuento porcentual',()=>{
 const a=['$1.000,00','$2.000,00','$2.500,00'];
 const d=doc(a,'0.0');d.declaredTotalLiteral='$5.500,00';
 d.prueba.sumLineCents='550000';d.prueba.declaredTotalCents='550000';
 d.lineas.forEach((l,i)=>l.descriptionLiteral=descriptions[i]);
 const source=rows('0,0',a);source[0].texto='ITEM CANT DESCRIPCION SUBTOTAL';
 source.slice(1,4).forEach(x=>x.texto=x.texto.replace(' 0,0%',''));
 source[4].texto='TOTAL $5.500,00';
 const r=auditar(d,source,SHA);
 assert.deepEqual(r.precios.map(x=>x.estado),Array(3).fill('importe_sin_ajuste_conciliado'));
 assert.deepEqual(r.precios.map(x=>x.descuentoPorcentaje),[null,null,null]);
 sinIVA(r);
});
test('MVP166: si el PDF contiene IVA 21% más descuento en mismo renglón, no atribuye mal la tasa',()=>{
 const source=rows();source[1].texto+=' IVA 21%';
 const r=auditar(doc(),source,SHA);
 assert.equal(r.estado,'parcial');
 assert.equal(r.precios[0].estado,'descuento_ambiguo');
 assert.equal(r.precios[0].unitarioComercialTrasDescuento,null);
 sinIVA(r);
});
test('MVP166: renglón PDF duplicado no se certifica',()=>{
 const source=rows();source.push({...source[1],fila:6});
 assert.equal(auditar(doc(),source,SHA).precios[0].estado,'fila_no_univoca');
});
test('MVP166: localizador duplicado en extracto se rechaza entero',()=>{
 const source=rows();source.push({...source[1]});
 assert.equal(auditar(doc(),source,SHA).estado,'fuente_no_acreditada');
});
test('MVP166: descuento escrito solo por la IA sin porcentaje fuente no se acredita',()=>{
 const source=rows();source[1].texto=source[1].texto.replace(' 22,4%','');
 assert.equal(auditar(doc(),source,SHA).precios[0].estado,'importe_no_conciliado');
});
test('MVP166: descuento modificado a 99,9% no cumple aritmética ni obtiene precio',()=>{
 const source=rows();source[1].texto=source[1].texto.replace('22,4%','99,9%');
 const r=auditar(doc(),source,SHA);
 assert.equal(r.precios[0].estado,'importe_no_conciliado');
 assert.equal(r.precios[0].unitarioComercialTrasDescuento,null);
});
test('MVP166: cantidad/importe original corruptos no se reparan silenciosamente',()=>{
 const d=doc();d.lineas[0].quantityLiteral='0,00';
 assert.equal(auditar(d,rows(),SHA).precios[0].estado,'datos_insuficientes');
 const bad=doc();bad.prueba.declaredTotalCents='426700';
 assert.equal(auditar(bad,rows(),SHA).estado,'fuente_no_acreditada');
});
test('MVP166: hashing, identidad de mensaje, version y vigencia se respetan',()=>{
 const d=doc();
 assert.equal(auditar(d,rows(),'c'.repeat(64)).estado,'fuente_no_acreditada');
 for(const p of [
  {sourceSha256:'c'.repeat(64)}, {version:8},
  {revisionVigente:false},{cotizacionVigente:false},
  {rankingAllowed:true},{state:'needs_source_review'},
  {reason:'missing_line'}
 ]){
  const bad=doc();bad.prueba={...bad.prueba,...p};
  assert.equal(auditar(bad,rows(),SHA).estado,'fuente_no_acreditada',JSON.stringify(p));
 }
});
test('MVP166: presupuestos con importe de renglón extra no conciliado se niegan',()=>{
 const d=doc();d.lineas.push({...d.lineas[0],lineNo:4,lineTotalLiteral:'$15,00'});
 d.prueba.lineCount=4;
 assert.equal(auditar(d,rows(),SHA).estado,'fuente_no_acreditada');
});
test('MVP166: a falta de fila o de datos, se informa sin borrar las demás líneas',()=>{
 const source=rows().filter(x=>x.fila!==2);
 const r=auditar(doc(),source,SHA);
 assert.equal(r.estado,'parcial');
 assert.equal(r.precios.length,3);
 assert.equal(r.precios[0].estado,'fila_no_univoca');
 assert.equal(r.precios[1].estado,'descuento_explicito_conciliado');
});
test('MVP166: tabla de XLSX con columna DSCTO y separadores mantiene localizadores virtuales',()=>{
 const s=rows();
 s[1].texto='1,00 · BIG BAG de Arena · $1.000,00 · 22,4% · $776,00';
 s[2].texto='2,00 · BIG BAG de Piedra · $1.000,00 · 22,4% · $1.552,00';
 s[3].texto='25,00 · cemento avellaneda x 25 kg · $100,00 · 22,4% · $1.940,00';
 const r=auditar(doc(),s,SHA);
 assert.equal(r.estado,'descuentos_conciliados_sin_iva');
 assert.ok(!JSON.stringify(r).includes('original_description'));
});
test('MVP166: tasas imposibles, ambiguas o repetidas se rechazan',()=>{
 for(const v of ['100%','22,333%','22,4% 5%','IVA 21%']){
  const s=rows();s[1].texto=s[1].texto.replace('22,4%',v);
  const r=auditar(doc(),s,SHA);
  assert.notEqual(r.precios[0].estado,'descuento_explicito_conciliado',v);
 }
});
