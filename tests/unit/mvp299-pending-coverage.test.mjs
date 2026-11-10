import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resumenPrivadoMvp245} from
 '../../supabase/functions/cotironda-piloto-whapi/ai-central-supplier-mvp227.ts';
import {vistaPendientesRubrosMvp299} from
 '../../src/domain/ia-central/vista-pendientes-rubros-mvp299.ts';
import vm from 'node:vm';
const proxy=readFileSync(new URL('../../piloto/seguimiento-web/api/estado.js',
 import.meta.url),'utf8');
const buyerView=vm.runInNewContext(proxy.slice(0,proxy.indexOf('export default'))+
 '\n buyerView;',{}, {timeout:1500});

const rubric={rubro:'obra_gruesa',solicitados:2,respondidos:1,
 cobertura:'parcial',precioComprobado:0,faltantes:['item_2']};
const reading={
 estado:'interpretada_para_revision',motivo:'condiciones_pendientes_de_verificacion',
 oferta:{moneda:'no_informada',iva:'no_informado',
  flete:'no_informado',pago:'no_informado',
  fuente:'20 bolsas de cemento a $500, sin moneda explícita',
  lineas:[],vinculos:[]},
 cobertura:{ofertas:[{estado:'requiere_revision',
  motivos:['moneda_no_informada','sin_precios_comparables'],
  rubros:[rubric],precios:[],presentaciones:[]}]}
};
const verified={received_count:1,files_pending_review:1,
 offers:[],rubros_ia:[{rubro:'obra_gruesa',titulo:'Obra gruesa / Corralón',
  solicitados:2,ofertas:0}]};
const raw={
 state:'respuestas_pendientes_por_rubro',
 respuestas:[{label:'Respuesta en revisión 1',
  rubros:[{rubro:'obra_gruesa',respondidos:1,solicitados:2}]}],
 ranking_permitido:false,contactos_revelados:false,
 adjudicacion_automatica:false
};
const base={state:'waiting',can_open:false,received_count:1,
 files_pending_review:1,deadline:'2026-11-15T00:00:00Z',
 rubros_ia:verified.rubros_ia};
const clone=x=>structuredClone(x);

test('source-reviewed but noncomparable quote gets ONLY private eligibility flag',()=>{
 const s=resumenPrivadoMvp245(reading);
 assert.equal(s.cobertura_pendiente_mvp299,true);
 assert.equal(s.estado,'requiere_revision');
 assert.equal(JSON.stringify(s).includes(reading.oferta.fuente),false);
 assert.equal(s.precios.length,0);
});
test('invalid evidence and mappings NEVER qualify as interpreted coverage',()=>{
 for(const reason of ['pedido_invalido','oferta_sin_evidencia_original',
  'importe_de_fuente_sin_renglon','correspondencia_inconsistente',
  'equivalencia_no_acreditada','moneda_sin_evidencia_explicita',
  'condicion_iva_sin_evidencia','condicion_flete_sin_evidencia',
  'cantidad_o_unidad_no_comparable','condiciones_invalidas']){
  const bad=clone(reading);
  bad.cobertura.ofertas[0].motivos.push(reason);
  assert.equal(resumenPrivadoMvp245(bad).cobertura_pendiente_mvp299,false,reason);
 }
 const missing=clone(reading);
 missing.cobertura.ofertas[0].rubros[0].respondidos=0;
 assert.equal(resumenPrivadoMvp245(missing).cobertura_pendiente_mvp299,false);
 assert.equal(resumenPrivadoMvp245({...reading,estado:'requiere_revision'}),null);
});
test('unverified buyer DTO is separate from comparable offers and contains no money',()=>{
 const out=vistaPendientesRubrosMvp299(raw,verified);
 assert.ok(out);
 assert.equal(out.respuestas.length,1);
 assert.equal(out.respuestas[0].rubros[0].respondidos,1);
 assert.equal(out.respuestas[0].rubros[0].titulo,'Obra gruesa / Corralón');
 assert.equal(JSON.stringify(out).includes('centavos'),false);
 assert.equal(JSON.stringify(out).includes('supplier_key'),false);
 assert.equal(JSON.stringify(out).includes('source_sha'),false);
});
test('malformed, duplicate, extra private fields and cross-rubro abuse all fail closed',()=>{
 const cases=[];
 cases.push({...raw,telefono:'2210000000'});
 cases.push({...raw,ranking_permitido:true});
 cases.push({...raw,respuestas:[{...raw.respuestas[0],supplier_key:'supplier-1'}]});
 cases.push({...raw,respuestas:[{...raw.respuestas[0],rubros:[
  {...raw.respuestas[0].rubros[0],centavos:'123400'}]}]});
 cases.push({...raw,respuestas:[{...raw.respuestas[0],rubros:[
  {rubro:'pintura',respondidos:1,solicitados:1}]}]});
 cases.push({...raw,respuestas:[{...raw.respuestas[0],rubros:[
  {rubro:'obra_gruesa',respondidos:3,solicitados:2}]}]});
 cases.push({...raw,respuestas:[raw.respuestas[0],raw.respuestas[0]]});
 cases.push({...raw,respuestas:[{...raw.respuestas[0],label:'Nombre de negocio'}]});
 cases.push({...raw,respuestas:[{...raw.respuestas[0],rubros:[
  raw.respuestas[0].rubros[0],raw.respuestas[0].rubros[0]]}]});
 for(const value of cases)
  assert.equal(vistaPendientesRubrosMvp299(value,verified),null,
   JSON.stringify(value).slice(0,150));
 assert.equal(vistaPendientesRubrosMvp299(raw,null),null);
 assert.equal(vistaPendientesRubrosMvp299({state:'not_found'},verified),null);
});
test('proxy preserves pending when can_open false, never turns into verified offers',()=>{
 const pending=vistaPendientesRubrosMvp299(raw,verified);
 const out=buyerView({...base,pendientes_rubros_ia:pending});
 assert.ok(out);
 assert.equal(out.can_open,false);
 assert.equal(out.offers,undefined);
 assert.equal(out.pendientes_rubros_ia.respuestas.length,1);
 assert.equal(out.finalists,undefined);
 assert.equal(out.material_baskets,undefined);
 assert.deepEqual(JSON.parse(JSON.stringify(buyerView({state:'not_found',pendientes_rubros_ia:pending}))),
  {state:'not_found'});
 assert.deepEqual(JSON.parse(JSON.stringify(buyerView({state:'cancelled',pendientes_rubros_ia:pending}))),
  {state:'cancelled',can_open:false});
});
test('proxy strips injected identity, prices and invalid counts',()=>{
 const pending=vistaPendientesRubrosMvp299(raw,verified);
 const withExtras=clone(pending);
 withExtras.respuestas[0].supplier_name='Un proveedor';
 withExtras.respuestas[0].rubros[0].precio='$123';
 const drop=buyerView({...base,pendientes_rubros_ia:withExtras});
 assert.equal(drop.pendientes_rubros_ia,undefined);
 const inflated=clone(pending);
 inflated.respuestas[0].rubros[0].respondidos=99;
 assert.equal(buyerView({...base,pendientes_rubros_ia:inflated}).pendientes_rubros_ia,
  undefined);
});
test('integration route does not widen can_open or merge unverified offers into MVP255',()=>{
 const edge=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-seguimiento/index.ts',import.meta.url),'utf8');
 const block=edge.slice(edge.indexOf('// MVP299: independent'),
  edge.indexOf('// Optional projection fails closed'));
 assert.match(block,/cotironda_piloto_ia_pending_coverage_mvp299/u);
 assert.match(block,/vistaPendientesRubrosMvp299\(pending.data,safe\)/u);
 assert.doesNotMatch(block,/can_open:|offers:|finalists:|contacts:/u);
 const web=readFileSync(new URL(
  '../../piloto/seguimiento-web/site.js',import.meta.url),'utf8');
 assert.match(web,/showPendingRubros\(d\)/u);
 assert.match(web,/pendingRubrosSection/u);
});
