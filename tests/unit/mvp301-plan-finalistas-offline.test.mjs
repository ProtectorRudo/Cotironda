import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {proponerCoberturaFinalMvp301 as propose} from
 '../../src/domain/ia-central/planificador-finalistas-offline-mvp301.ts';
import {evaluarCotizacionMvp225,compararPorRubroMvp225} from
 '../../src/domain/ia-central/calificador-cotizaciones-mvp225.ts';
import {opcionesPorRubroMvp254} from
 '../../src/domain/ia-central/opciones-cobertura-rubros-mvp254.ts';

const items=[
 {id:'item_1',descripcion:'Cemento CPC 50 kg',rubro:'obra_gruesa',
  cantidad:'20',unidad:'bag'},
 {id:'item_2',descripcion:'Pintura latex interior',rubro:'pintura',
  cantidad:'5',unidad:'l'}
];
const refs=[
 {text:'20 bolsas cemento CPC 50 kg · $9.000 c/u · total $180.000',
  desc:'Cemento CPC',qty:'20',unit:'bag',
  unitPrice:'$9.000',total:'$180.000'},
 {text:'5 litros pintura latex interior · $15.000 c/u · total $75.000',
  desc:'Pintura latex',qty:'5',unit:'l',
  unitPrice:'$15.000',total:'$75.000'}
];
function q(label,indices=[0,1]){
 const lines=indices.map((i,index)=>({
  numero:index+1,textoOriginal:refs[i].text,
  descripcion:refs[i].desc,cantidad:refs[i].qty,unidad:refs[i].unit,
  precioUnitarioLiteral:refs[i].unitPrice,
  totalLineaLiteral:refs[i].total,tipo:'material'
 }));
 return {
  etiquetaAnonima:label,moneda:'ARS',iva:'no_informado',
  flete:'no_informado',pago:'no_informado',
  fuente:'Moneda: ARS\n'+lines.map(x=>x.textoOriginal).join('\n'),
  lineas:lines,vinculos:indices.map((i,index)=>({
   lineaOferta:index+1,articuloPedido:items[i].id,
   equivalencia:'misma_presentacion',
   explicacion:'Presentacion idéntica comprobada'
  }))
 };
}
const run=(quotes,closed=true,pedido=items)=>propose({
 cierreComprobado:closed,pedido,presupuestos:quotes
});
test('MVP301: simulación con dos respuestas por rubro: plan privado complementario',()=>{
 const quotes=[q('Presupuesto 1',[0]),q('Presupuesto 2',[1])];
 for(let i=0;i<quotes.length;i++)
  assert.equal(evaluarCotizacionMvp225(items,quotes[i]).estado,
   'verificada_para_comparacion');
 const proof=compararPorRubroMvp225(items,quotes);
 assert.equal(proof.ofertas.length,2);
 assert.equal(proof.rankingGlobalPermitido,false);
 const rubros=opcionesPorRubroMvp254(items,quotes);
 assert.equal(rubros.rubros.length,2);
 assert.equal(rubros.rankingGlobalPermitido,false);
 const out=run(quotes);
 assert.equal(out.estado,'opciones_para_decision_manual');
 assert.equal(out.ofertasVerificadas,2);
 assert.equal(out.propuestas.length,1);
 assert.deepEqual(out.propuestas[0].ofertasAnonimas,
  ['Presupuesto 1','Presupuesto 2']);
 assert.equal(out.propuestas[0].modo,'complementaria');
 assert.deepEqual(out.propuestas[0].rubros,['obra_gruesa','pintura']);
 for(const k of ['rankingGlobalPermitido','ganadorElegido',
  'adjudicacionAutomatica','contactosRevelados','mensajesEnviados',
  'produccionModificada'])assert.equal(out[k],false);
 assert.equal(out.aprobacionManualRequerida,true);
 assert.doesNotMatch(JSON.stringify(out),/sha|hmac|corralon_|221[0-9]{7}|\$[0-9]|cents|centavos|whapi|contactosRevelados":true/iu);
});
test('MVP301: dos ofertas completas son alternativas, no dos ganadores',()=>{
 const r=run([q('Presupuesto 1'),q('Presupuesto 2')]);
 assert.equal(r.estado,'opciones_para_decision_manual');
 assert.equal(r.propuestas.length,2);
 assert.ok(r.propuestas.every(x=>x.modo==='individual'));
 assert.deepEqual(r.propuestas.map(x=>x.ofertasAnonimas[0]),
  ['Presupuesto 1','Presupuesto 2']);
 assert.equal(r.ganadorElegido,false);
});
test('MVP301: completa + parcial no agrega pareja redundante',()=>{
 const r=run([q('Presupuesto 1'),q('Presupuesto 2',[1])]);
 assert.equal(r.propuestas.length,1);
 assert.deepEqual(r.propuestas[0].ofertasAnonimas,['Presupuesto 1']);
});
test('MVP301: dos parciales del mismo artículo no ofrecen cobertura completa',()=>{
 const r=run([q('Presupuesto 1',[0]),q('Presupuesto 2',[0])]);
 assert.equal(r.estado,'sin_cobertura_completa');
 assert.equal(r.propuestas.length,0);
});
test('MVP301: sin prueba de cierre, ni siquiera una cotización perfecta propone plan',()=>{
 const r=run([q('Presupuesto 1')],false);
 assert.equal(r.estado,'cierre_no_acreditado');
 assert.equal(r.ganadorElegido,false);
});
test('MVP301: total adulterado bloquea fuente; no inventar precio ni ganador',()=>{
 const bad=q('Presupuesto 1',[0]);
 bad.lineas[0].textoOriginal=bad.lineas[0].textoOriginal
  .replace('$180.000','$190.000');
 bad.lineas[0].totalLineaLiteral='$190.000';
 bad.fuente='Moneda: ARS\n'+bad.lineas[0].textoOriginal;
 const r=run([bad,q('Presupuesto 2',[1])]);
 assert.equal(r.estado,'sin_cobertura_completa');
 assert.equal(r.ofertasEnRevision,1);
 assert.equal(r.propuestas.length,0);
});
test('MVP301: costo sin moneda se retiene; no competir con cotización acreditada',()=>{
 const noCurrency=q('Presupuesto 2',[1]);
 noCurrency.moneda='no_informada';
 noCurrency.fuente=noCurrency.fuente.replace('Moneda: ARS\n','');
 const out=run([q('Presupuesto 1',[0]),noCurrency]);
 assert.equal(out.estado,'sin_cobertura_completa');
 assert.equal(out.ofertasEnRevision,1);
});
test('MVP301: un material pedido sin precio cotejado no cuenta como cobertura final',()=>{
 const alt=q('Presupuesto 2',[1]);
 alt.vinculos[0].equivalencia='alternativa_razonable';
 const r=run([q('Presupuesto 1',[0]),alt]);
 assert.equal(r.estado,'sin_cobertura_completa');
 assert.equal(r.ganadorElegido,false);
});
test('MVP301: etiquetas privadas, duplicadas y entradas inventadas se rechazan',()=>{
 const cases=[
  [q('Corralón de Ailín')],
  [q('Presupuesto 1'),q('Presupuesto 1')],
  Array.from({length:13},(_,i)=>q('Presupuesto '+(i+1)))
 ];
 for(const casesOf of cases){
  assert.equal(run(casesOf).estado,'fuentes_invalidas');
 }
 assert.equal(run([],true,[]).estado,'fuentes_invalidas');
});
test('MVP301: legacy MVP196 requiere documentos v9, no tablas IA Central MVP227',()=>{
 const old=readFileSync(new URL(
  '../../supabase/piloto/mvp196_commercial_finalists_source_plan_off.sql',
  import.meta.url),'utf8');
 assert.match(old,/supplier_media_quotes_mvp098/u);
 assert.match(old,/supplier_evidence_mvp138/u);
 assert.doesNotMatch(old,/ai_supplier_review_mvp227/u);
 const current=readFileSync(new URL(
  '../../supabase/piloto/mvp227_presupuestos_rubros_ia_privados.sql',
  import.meta.url),'utf8');
 assert.match(current,/ai_supplier_review_mvp227/u);
 const newPlan=readFileSync(new URL(
  '../../src/domain/ia-central/planificador-finalistas-offline-mvp301.ts',
  import.meta.url),'utf8');
 assert.match(newPlan,/compararPorRubroMvp225/u);
 assert.match(newPlan,/gruposCoberturaMvp254/u);
 assert.doesNotMatch(newPlan,/fetch\(|supabase\.co|gate\.whapi\.cloud|http_post|Deno\.env/u);
});
