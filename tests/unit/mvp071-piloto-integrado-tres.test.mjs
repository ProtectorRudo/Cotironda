import test from 'node:test';
import assert from 'node:assert/strict';
import {
 prepararEnsayoTresMvp071,preservarPresupuestosTresMvp071,
 PEDIDO_PILOTO_TRES_MVP071,PRESUPUESTO_A_MVP071,PRESUPUESTO_B_MVP071
} from '../../src/domain/piloto-integrado-tres-mvp071.ts';
import {LISTADO_AMBOS_CORRALONES_MVP070}
 from '../../src/domain/catalogo-fixture-corralones-mvp070.ts';
test('MVP071: dos corralones con idéntica oferta de familias reciben el pedido',()=>{
 const r=prepararEnsayoTresMvp071();
 assert.equal(r.modo,'simulacion_sin_red');
 assert.equal(r.enviosWhatsApp,0);
 assert.equal(r.datosPersistidos,false);
 assert.equal(r.plan.estado,'simulacion_cobertura_sin_envio');
 assert.equal(r.catalogos.corralon_a.totalFilas,51);
 assert.deepEqual(r.catalogos.corralon_a,r.catalogos.corralon_b);
 assert.deepEqual(r.plan.invitaciones.map(x=>x.comercio),['corralon_a','corralon_b']);
 assert.deepEqual(r.plan.invitaciones[0].items,r.plan.invitaciones[1].items);
 assert.deepEqual(r.plan.invitaciones[0].items.map(x=>x.product_code),
  ['cemento_gris_obra','hidrofugo']);
});
test('MVP071: falta zona o producto reconocible => no invita a nadie',()=>{
 const r=prepararEnsayoTresMvp071('20 bolsas de cemento CPC 50 kg');
 assert.equal(r.plan.estado,'pedido_necesita_aclaracion');
 assert.equal(r.plan.invitaciones.length,0);
});
test('MVP071: cambio de zona elimina solamente el negocio fuera de zona',()=>{
 const r=prepararEnsayoTresMvp071(PEDIDO_PILOTO_TRES_MVP071,'La Plata','Berisso');
 assert.deepEqual(r.plan.invitaciones.map(x=>x.comercio),['corralon_a']);
});
test('MVP071: catálogo vacío/inseguro no autoriza invitación general',()=>{
 const r=prepararEnsayoTresMvp071(PEDIDO_PILOTO_TRES_MVP071,
  'La Plata','La Plata','Invento desconocido\nLadrillo refractario',
  LISTADO_AMBOS_CORRALONES_MVP070);
 assert.deepEqual(r.plan.invitaciones.map(x=>x.comercio),['corralon_b']);
});
test('MVP071: presupuesto original completo incluye extras y total no se reescribe',()=>{
 const q=preservarPresupuestosTresMvp071(PRESUPUESTO_A_MVP071,PRESUPUESTO_B_MVP071);
 assert.equal(q.a.original,PRESUPUESTO_A_MVP071);
 assert.equal(q.b.original,PRESUPUESTO_B_MVP071);
 assert.equal(q.a.totalLiteral,'$ 237.500,00');
 assert.equal(q.b.totalLiteral,'$ 204.500,00');
 for(const fragment of ['2 pallets vacíos','1 bolsón vacío','Flete:','Descuento:'])
  assert.ok(q.a.original.includes(fragment),fragment);
 assert.equal(q.ranking,'no_verificable_sin_extraccion_economica_y_condiciones');
 assert.equal(q.enviosWhatsApp,0);
 assert.equal(q.adjudicacion,'no_realizada');
});
test('MVP071: textos editados, renglones adicionales y total ambiguo siguen intactos',()=>{
 const edited=PRESUPUESTO_A_MVP071+'\nPallet adicional: $ 1.800,00\nTOTAL FINAL: $ 239.300,00';
 const q=preservarPresupuestosTresMvp071(edited,PRESUPUESTO_B_MVP071);
 assert.equal(q.a.original,edited);
 assert.equal(q.a.totalLiteral,null);
 assert.equal(q.a.revisionTotal,true);
 assert.equal(q.ranking,'no_verificable_sin_extraccion_economica_y_condiciones');
});
test('MVP071: no se aceptan presupuestos vacíos ni se inventan números',()=>{
 assert.throws(()=>preservarPresupuestosTresMvp071(' ',PRESUPUESTO_B_MVP071),
  /faltan_presupuestos/);
 assert.throws(()=>preservarPresupuestosTresMvp071(PRESUPUESTO_A_MVP071,''),
  /faltan_presupuestos/);
});
