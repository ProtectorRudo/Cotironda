import test from 'node:test';
import assert from 'node:assert/strict';
import {prepararPedidoTextoMvp028} from '../../src/domain/pedido-piloto-mvp028.ts';
import {planificarAclaracionesMvp033} from '../../src/domain/pedido-aclaraciones-mvp033.ts';

const material='10 bolsas de cemento CPC 50 kg';

test('MVP033: lista con localidad explícita no muestra pregunta extra',()=>{
 const p=prepararPedidoTextoMvp028(material+'\nEntrega en: La Plata');
 const plan=planificarAclaracionesMvp033(p);
 assert.equal(plan.preguntarZona,false);
 assert.equal(plan.permitirEnvio,true);
 assert.equal(plan.pendientes.length,0);
 assert.equal(p.zonaEntrega,'La Plata');
});

test('MVP033: sin localidad pregunta una sola vez, sin falso error de material',()=>{
 const p=prepararPedidoTextoMvp028(material);
 const plan=planificarAclaracionesMvp033(p);
 assert.equal(plan.preguntarZona,true);
 assert.equal(plan.permitirEnvio,false);
 assert.equal(plan.pendientes.length,0);
 const completado=planificarAclaracionesMvp033(
  prepararPedidoTextoMvp028(material,'La Plata')
 );
 assert.equal(completado.preguntarZona,false);
 assert.equal(completado.permitirEnvio,true);
});

test('MVP033: localidad escrita inválida o contradictoria obliga aclaración',()=>{
 const invalida=planificarAclaracionesMvp033(
  prepararPedidoTextoMvp028(material,'///')
 );
 assert.equal(invalida.preguntarZona,true);
 assert.equal(invalida.permitirEnvio,false);
 const contradictoria=planificarAclaracionesMvp033(
  prepararPedidoTextoMvp028(material+'\nEntrega en: La Plata\nEntrega en: Rosario')
 );
 assert.equal(contradictoria.preguntarZona,true);
 assert.equal(contradictoria.permitirEnvio,false);
});

test('MVP033: zona válida no oculta líneas ambiguas ni habilita envío parcial',()=>{
 const p=prepararPedidoTextoMvp028(
  material+'\n1 servicio colocación\nEntrega en: La Plata'
 );
 const plan=planificarAclaracionesMvp033(p);
 assert.equal(plan.preguntarZona,false);
 assert.equal(plan.permitirEnvio,false);
 assert.equal(plan.pendientes.length,1);
 assert.equal(p.items.length,1);
});

test('MVP033: IVA contradictorio retiene; falta zona se pregunta sin esconder IVA',()=>{
 const p=prepararPedidoTextoMvp028(
  material+'\nNecesito presupuesto con IVA incluido\nSolicito precios sin IVA'
 );
 const plan=planificarAclaracionesMvp033(p);
 assert.equal(plan.preguntarZona,true);
 assert.equal(plan.permitirEnvio,false);
 assert.ok(plan.pendientes.some(x=>x.texto==='IVA'));
 const conZona=planificarAclaracionesMvp033(
  prepararPedidoTextoMvp028(
   material+'\nNecesito presupuesto con IVA incluido\nSolicito precios sin IVA',
   'La Plata'
  )
 );
 assert.equal(conZona.preguntarZona,false);
 assert.equal(conZona.permitirEnvio,false);
});

test('MVP033: plan inmutable y sin modificar los pendientes originales',()=>{
 const p=prepararPedidoTextoMvp028(material);
 const n=p.pendientes.length;
 const plan=planificarAclaracionesMvp033(p);
 assert.ok(Object.isFrozen(plan));
 assert.ok(Object.isFrozen(plan.pendientes));
 assert.equal(p.pendientes.length,n);
 assert.ok(p.pendientes.some(x=>x.texto==='Zona de entrega'));
});

test('MVP033: el campo viejo no pisa la localidad editada en el texto',()=>{
 const pedido=prepararPedidoTextoMvp028(
  material+'\nEntrega en: Rosario','La Plata'
 );
 const plan=planificarAclaracionesMvp033(pedido);
 assert.equal(pedido.zonaEntrega,null);
 assert.equal(plan.preguntarZona,true);
 assert.equal(plan.permitirEnvio,false);
 const corregido=planificarAclaracionesMvp033(
  prepararPedidoTextoMvp028(material+'\nEntrega en: Rosario','Rosario')
 );
 assert.equal(corregido.preguntarZona,false);
 assert.equal(corregido.permitirEnvio,true);
});

test('MVP033: dos destinos en la lista no se ocultan con campo de localidad',()=>{
 const p=prepararPedidoTextoMvp028(
  material+'\nEntrega en: La Plata\nEntrega en: Rosario','La Plata'
 );
 const plan=planificarAclaracionesMvp033(p);
 assert.equal(p.zonaEntrega,null);
 assert.equal(plan.preguntarZona,true);
 assert.equal(plan.permitirEnvio,false);
});
