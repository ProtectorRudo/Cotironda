import test from 'node:test';
import assert from 'node:assert/strict';
import {
 EJEMPLO_PILOTO_MVP038,crearEscenarioMvp038,propuestasFicticiasMvp038,
 compararPilotoMvp038,dineroDemostrativoMvp038
} from '../../src/domain/piloto-navegable-mvp038.ts';

const s=()=>crearEscenarioMvp038(EJEMPLO_PILOTO_MVP038);
test('MVP038: mismo pedido va desde buyer hasta las dos respuestas y comparación',()=>{
 const v=s();
 assert.equal(v.pedido.estado,'listo_para_registrar');
 assert.equal(v.pedido.zonaEntrega,'La Plata');
 assert.equal(v.pedido.items.length,2);
 assert.deepEqual(v.pedido.items.map(x=>x.source_description),[
  'Cemento CPC Loma Negra 50 kg','Hidrófugo para mezcla'
 ]);
 assert.equal(v.whatsappEnviados,0);
 assert.equal(v.datosPersistidos,false);
 const q=propuestasFicticiasMvp038(v.pedido);
 assert.deepEqual(q.map(x=>x.lineas.length),[2,2]);
 const c=compararPilotoMvp038(v.pedido,q);
 assert.deepEqual(c.cobertura.map(x=>x.lineasCompletas),[2,1]);
 assert.ok(c.opcionesCompletas.some(x=>x.proveedoresAnonimos.join(',')==='anon_a'));
 assert.equal(c.adjudicacionAutomatica,false);
 assert.equal(c.contactoRevelado,false);
});
test('MVP038: cantidades elegidas por usuario se usan, no precios totales fijos',()=>{
 const a=crearEscenarioMvp038('20 bolsas de Cemento CPC 50 kg\nEntrega en: La Plata');
 const b=crearEscenarioMvp038('30 bolsas de Cemento CPC 50 kg\nEntrega en: La Plata');
 const q1=propuestasFicticiasMvp038(a.pedido);
 const q2=propuestasFicticiasMvp038(b.pedido);
 const one=compararPilotoMvp038(a.pedido,q1).cobertura[0].totalComparable;
 const two=compararPilotoMvp038(b.pedido,q2).cobertura[0].totalComparable;
 assert.notEqual(one,two);
 assert.equal(a.pedido.items[0].quantity,'20');
 assert.equal(b.pedido.items[0].quantity,'30');
});
test('MVP038: pedidos incompletos, desconocidos o sin zona no se publican',()=>{
 for(const x of [
  '10 bolsas de Cemento CPC 50 kg',
  '10 bolsas de coso misterioso\nEntrega en: La Plata',
  '10 bolsas de Cemento CPC 50 kg\n20 bolsas de Cemento CPC 25 kg\nEntrega en: La Plata'
 ]){
  const p=crearEscenarioMvp038(x);
  assert.equal(p.pedido.estado,'requiere_aclaracion');
  assert.throws(()=>propuestasFicticiasMvp038(p.pedido),/mvp038_demo_invalida/);
 }
});
test('MVP038: IVA ausente NO se inventa y el comparador conserva el aviso',()=>{
 const p=s().pedido,q=propuestasFicticiasMvp038(p);
 for(const o of q)for(const l of o.lineas)l.iva='';
 const c=compararPilotoMvp038(p,q);
 assert.equal(c.opcionesCompletas.length,0);
 assert.ok(c.cobertura.some(x=>x.motivos.includes('precio_o_iva_desconocido')));
});
test('MVP038: flete ausente NO se interpreta como gratis',()=>{
 const p=s().pedido,q=propuestasFicticiasMvp038(p);
 for(const o of q)o.flete='';
 const c=compararPilotoMvp038(p,q);
 assert.equal(c.opcionesCompletas.length,0);
 assert.ok(c.cobertura.every(x=>x.motivos.includes('flete_desconocido')));
});
test('MVP038: oferta parcial barata nunca gana el ranking por total',()=>{
 const p=s().pedido,q=propuestasFicticiasMvp038(p);
 q[1].lineas[0].precioNeto='1';
 const c=compararPilotoMvp038(p,q);
 assert.equal(c.cobertura[1].totalComparable,null);
 assert.equal(c.cobertura[1].lineasCompletas,1);
 assert.ok(c.opcionesCompletas.every(x=>x.asignacion.length===p.items.length));
});
test('MVP038: respuesta todavía no presentada nunca produce opción propia',()=>{
 const p=s().pedido,q=propuestasFicticiasMvp038(p);
 q[0].presentada=false;
 const c=compararPilotoMvp038(p,q);
 assert.equal(c.opcionesCompletas.length,0);
 assert.ok(c.cobertura[0].motivos.includes('oferta_no_confirmada'));
});
test('MVP038: condiciones de pago/plazo distintos no se mezclan en combinación',()=>{
 const p=s().pedido,q=propuestasFicticiasMvp038(p);
 q[1].pago='contado';
 const c=compararPilotoMvp038(p,q);
 assert.ok(c.opcionesCompletas.every(x=>x.proveedoresAnonimos.length===1));
});
test('MVP038: montos numéricos de 2 decimales sin inferir miles ni redondear',()=>{
 assert.equal(dineroDemostrativoMvp038('8500,50'),'8500.50');
 assert.equal(dineroDemostrativoMvp038(''),null);
 for(const invalid of ['1.000','10,123','-2','12.000,50','NaN','12345678910','50 USD',' 500']){
  assert.throws(()=>dineroDemostrativoMvp038(invalid),/mvp038_demo_invalida/,invalid);
 }
});
test('MVP038: aun con precios válidos, plazo inválido no se envía a comparador',()=>{
 const p=s().pedido,q=propuestasFicticiasMvp038(p);
 q[1].plazoDias='999';
 assert.throws(()=>compararPilotoMvp038(p,q),/mvp038_demo_invalida/);
});
