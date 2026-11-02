import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {construirPlantillasDesdePilotoMvp080 as construir,
 SQL_FUENTE_PRIVADA_MVP080 as SQL}
 from '../../src/server/plantillas-piloto-mvp080.ts';

const pedidoId='123e4567-e89b-42d3-a456-426614174000';
const quote=[
 'PRESUPUESTO DE PRUEBA',
 '20 bolsas cemento CPC 50 kg: $180.000',
 '5 litros hidrófugo: $35.000',
 'TOTAL: $215.000',
 'Valores ficticios para ensayo.'
].join('\n');
const hash=t=>createHash('sha256').update(t,'utf8').digest('hex');
const quoteRow=(extra={})=>({
 request_id:pedidoId,supplier_key:'corralon_ailin',revision_no:1,
 original_quote:quote,plaintext_sha256:hash(quote),buyer_key:'arquitecto',
 state:'prepared',...extra
});
const reviewed=(extra={})=>({
 proveedorRef:'corralon_ailin',revision:1,sha256Original:hash(quote),
 renglones:[
  {numeroLinea:1,categoria:'privado'},
  {numeroLinea:2,categoria:'material'},
  {numeroLinea:3,categoria:'material'},
  {numeroLinea:4,categoria:'total'},
  {numeroLinea:5,categoria:'aclaracion'}
 ],...extra
});
const ctx=(reviews=[])=>({
 solicitudId:pedidoId,compradorAutenticado:'arquitecto',revisionesPrivacidad:reviews
});
function port(rows){
 const calls=[];
 return {calls,query:async(sql,args)=>{
  calls.push({sql,args});return rows;
 }};
}
test('MVP080: sin revisión privada no revela renglones ni importes de fuente REAL',async()=>{
 const db=port([quoteRow()]);
 const r=await construir(db,ctx());
 assert.equal(r.ofertas.length,1);
 assert.equal(r.ofertas[0].etiqueta,'Proveedor A');
 assert.equal(r.ofertas[0].estado,'retenida_por_verificacion');
 assert.deepEqual(r.ofertas[0].renglones,[]);
 assert.equal(JSON.stringify(r).includes('$215.000'),false);
 assert.equal(JSON.stringify(r).includes('ailin'),false);
 assert.equal(JSON.stringify(r).includes('PRESUPUESTO'),false);
 assert.equal(r.envioWhatsapp,false);
 assert.equal(db.calls.length,1);
 assert.deepEqual(db.calls[0].args,[pedidoId,'arquitecto']);
 assert.equal(db.calls[0].sql,SQL);
 assert.ok(SQL.includes('o.request_id=$1::uuid'));
 assert.ok(SQL.includes('r.buyer_key=$2::text'));
 assert.ok(SQL.includes('w.plaintext_sha256'));
 assert.ok(SQL.includes('w.message_hmac=o.source_message_hmac'));
});
test('MVP080: revisión anclada al mensaje exacto produce plantilla fiel y anónima',async()=>{
 const result=await construir(port([quoteRow()]),ctx([reviewed()]));
 const x=result.ofertas[0];
 assert.equal(x.estado,'lista_para_vista');
 assert.deepEqual(x.renglones.map(l=>l.numeroLinea),[2,3,4,5]);
 assert.equal(x.renglones[0].textoLiteral,'20 bolsas cemento CPC 50 kg: $180.000');
 assert.equal(x.renglones[1].textoLiteral,'5 litros hidrófugo: $35.000');
 assert.equal(x.renglones[0].importeComprobable,null);
 assert.equal(x.totalLiteral,'$215.000');
 assert.equal(x.totalVerificado,false);
 assert.equal(x.renglones.at(-1).textoLiteral,'Valores ficticios para ensayo.');
 assert.equal(x.costoComparableCalculado,false);
 assert.equal(x.identidadRevelada,false);
 assert.equal(result.originalExpuesto,false);
 assert.equal(JSON.stringify(result).includes('corralon_ailin'),false);
});
test('MVP080: hash adulterado de origen jamás puede producir una oferta',async()=>{
 for(const altered of [
  quoteRow({original_quote:quote+' '}),
  quoteRow({plaintext_sha256:'0'.repeat(64)}),
  quoteRow({plaintext_sha256:'hash_ausente'})
 ]){
  await assert.rejects(construir(port([altered]),ctx([reviewed()])),
   /mvp080_fuente_o_autorizacion_invalida/);
 }
});
test('MVP080: revisión obsoleta o sin SHA coincidente retiene la versión vigente',async()=>{
 for(const wrongReview of [
  reviewed({revision:2}),reviewed({sha256Original:'1'.repeat(64)})
 ]){
  const r=await construir(port([quoteRow()]),ctx([wrongReview]));
  assert.equal(r.ofertas[0].estado,'retenida_por_verificacion');
  assert.equal(r.ofertas[0].totalLiteral,null);
 }
 const newer=quoteRow({revision_no:2});
 const r=await construir(port([newer]),ctx([reviewed()]));
 assert.equal(r.ofertas[0].revision,2);
 assert.equal(r.ofertas[0].estado,'retenida_por_verificacion');
});
test('MVP080: no cruza presupuestos de otro pedido, comprador ni participante',async()=>{
 for(const fake of [
  quoteRow({request_id:'123e4567-e89b-42d3-a456-426614174001'}),
  quoteRow({buyer_key:'comprador_otro'}),
  quoteRow({state:'cancelled'}),
  quoteRow({supplier_key:'550111111111'}),
  {...quoteRow(),telefono:'5492215555555'}
 ]){
  await assert.rejects(construir(port([fake]),ctx()),
   /mvp080_fuente_o_autorizacion_invalida/);
 }
 await assert.rejects(construir(port([]),{
  ...ctx(),compradorAutenticado:'proveedor_ajeno'
 }),/mvp080_fuente_o_autorizacion_invalida/);
});
test('MVP080: frente a líneas o cargos ocultados se retiene TODO',async()=>{
 const review=reviewed();
 review.renglones[2]={numeroLinea:3,categoria:'privado'};
 const r=await construir(port([quoteRow()]),ctx([review]));
 assert.equal(r.ofertas[0].estado,'retenida_por_verificacion');
 assert.deepEqual(r.ofertas[0].renglones,[]);
});
test('MVP080: dos proveedores siguen etiquetados A/B y el backend no filtra IDs',async()=>{
 const other=quoteRow({supplier_key:'corralon_nahuel'});
 const secondReview=reviewed({proveedorRef:'corralon_nahuel'});
 const x=await construir(port([quoteRow(),other]),ctx([reviewed(),secondReview]));
 assert.deepEqual(x.ofertas.map(o=>o.etiqueta),['Proveedor A','Proveedor B']);
 assert.equal(x.ofertas.every(o=>o.estado==='lista_para_vista'),true);
 assert.equal(JSON.stringify(x).includes('nahuel'),false);
});
test('MVP080: duplicados, exceso de ofertas, valores inesperados bloquean',async()=>{
 const invalid=[
  [quoteRow(),quoteRow()],
  Array.from({length:11},()=>quoteRow()),
  [quoteRow({revision_no:0})],
  [quoteRow({original_quote:''})]
 ];
 for(const rows of invalid){
  await assert.rejects(construir(port(rows),ctx()),
   /mvp080_fuente_o_autorizacion_invalida/);
 }
 await assert.rejects(construir(port([]),ctx([reviewed(),reviewed()])),
  /mvp080_fuente_o_autorizacion_invalida/);
});
test('MVP080: no inventa oferta, ranking o notificaciones sin cotizaciones',async()=>{
 const x=await construir(port([]),ctx());
 assert.deepEqual(x.ofertas,[]);
 assert.equal(x.envioWhatsapp,false);
 assert.equal(x.originalExpuesto,false);
});
