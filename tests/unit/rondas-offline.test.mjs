import test from 'node:test';
import assert from 'node:assert/strict';
import {crearRondaOffline,aplicarEventoRondaOffline} from '../../src/domain/rondas-offline.ts';

const A='2026-11-01T10:00:00.000Z',Z='2026-11-03T10:00:00.000Z';
const B='2026-11-01T11:00:00.000Z',C='2026-11-01T12:00:00.000Z';
const D='2026-11-02T10:00:00.000Z',E='2026-11-03T11:00:00.000Z';
const comprador={rol:'comprador'},sistema={rol:'sistema'};
const prov=anonId=>({rol:'proveedor',anonId});
const pedido={items:[{id:'cemento_001',cantidad:'10',unidad:'bag'},
  {id:'pintura_001',cantidad:'5',unidad:'l'}]};
const iniciar=(changes={})=>crearRondaOffline({
  rondaId:'ronda_001',inicioEn:A,cierreEn:Z,autorizacionDistribucion:true,
  pedido,invitadosAnonimos:['anon_aaa','anon_bbb'],...changes
});
const ev=(id,tipo,fecha,extra={})=>({id,tipo,fecha,...extra});
const abrir=(s)=>aplicarEventoRondaOffline(s,ev('ev_abrir','abrir',A),comprador);
const draft=(cost='100.00',extra={})=>({
  moneda:'ARS',formaPago:'contado',plazoEntregaDias:3,fleteFinal:'10.00',
  minimoCompraFinal:'0.00',items:[{itemId:'cemento_001',
    unidad:'bag',cantidadDisponible:'10',equivalencia:'verificada',
    precioUnitarioNeto:cost,ivaPorcentaje:'21'},
    {itemId:'pintura_001',unidad:'l',cantidadDisponible:'5',
    equivalencia:'verificada',precioUnitarioNeto:'20.00',ivaPorcentaje:'21'}],
  ...extra
});
const guardar=(s,id='anon_aaa',revision=0,fecha=B,body=draft(),eventId='ev_guardar')=>
  aplicarEventoRondaOffline(s,ev(eventId,'guardar_borrador',fecha,{
    anonId:id,revisionEsperada:revision,borrador:body}),prov(id));
const confirmar=(s,id='anon_aaa',revision=1,fecha=C,eventId='ev_confirmar')=>
  aplicarEventoRondaOffline(s,ev(eventId,'confirmar_oferta',fecha,{
    anonId:id,revisionEsperada:revision}),prov(id));
const cerrar=(s,fecha=Z)=>aplicarEventoRondaOffline(s,ev('ev_cerrar','cerrar',fecha),sistema);
const fail=fn=>assert.throws(fn,/ronda_operacion_no_permitida|comparacion_entrada_invalida/);

test('nace programada, sin cotizaciones ni envíos, comprador autorizó distribución una sola vez',()=>{
  const s=iniciar();
  assert.equal(s.estado,'programada');
  assert.equal(s.autorizacionDistribucion,true);
  assert.deepEqual(s.proveedores.map(x=>x.versiones.length),[0,0]);
  assert.equal(s.comparacionCierre,null);
  assert.ok(Object.isFrozen(s));
  assert.ok(Object.isFrozen(s.pedido.items[0]));
});
test('comprador abre, proveedor guarda, confirma, cierra y compara SOLO confirmadas',()=>{
  let s=iniciar();s=abrir(s);s=guardar(s);s=confirmar(s);s=cerrar(s);
  assert.equal(s.estado,'cerrada');assert.equal(s.eventos.length,4);
  assert.equal(s.proveedores[0].versiones[0].version,1);
  assert.equal(s.proveedores[0].versiones[0].oferta.confirmada,true);
  assert.equal(s.comparacionCierre.cobertura.length,1);
  assert.equal(s.comparacionCierre.opcionesCompletas.length,1);
  assert.equal(s.comparacionCierre.opcionesCompletas[0].totalFinal,'1341.00');
  assert.equal(s.comparacionCierre.contactoRevelado,false);
  assert.equal(s.comparacionCierre.adjudicacionAutomatica,false);
});
test('guardar no confirma: cierre ignora borradores aún con precios',()=>{
  const s=cerrar(guardar(abrir(iniciar())));
  assert.equal(s.estado,'cerrada');
  assert.equal(s.proveedores[0].versiones.length,0);
  assert.equal(s.comparacionCierre.opcionesCompletas.length,0);
});
test('versiones nuevas son inmutables y la comparación usa solo última versión',()=>{
  let s=confirmar(guardar(abrir(iniciar())));
  const historico=s.proveedores[0].versiones[0];
  s=guardar(s,'anon_aaa',1,D,draft('80.00'),'ev_corregir');
  assert.equal(s.proveedores[0].versiones.length,1);
  s=confirmar(s,'anon_aaa',2,D,'ev_confirmar_dos');
  assert.equal(s.proveedores[0].versiones.length,2);
  assert.equal(historico.oferta.items[0].precioUnitarioNeto,'100.00');
  assert.equal(s.proveedores[0].versiones[0].oferta.items[0].precioUnitarioNeto,'100.00');
  assert.equal(s.proveedores[0].versiones[1].oferta.items[0].precioUnitarioNeto,'80.00');
  s=cerrar(s);
  assert.equal(s.comparacionCierre.opcionesCompletas.length,1);
  assert.equal(s.comparacionCierre.opcionesCompletas[0].totalFinal,'1099.00');
});
test('el guardado copia valores, fuente mutable no puede alterar versiones',()=>{
  let s=abrir(iniciar());
  const raw=draft();
  s=guardar(s,'anon_aaa',0,B,raw);
  raw.items[0].precioUnitarioNeto='0.01';
  assert.equal(s.proveedores[0].borrador.items[0].precioUnitarioNeto,'100.00');
  s=confirmar(s);
  assert.ok(Object.isFrozen(s.proveedores[0].versiones[0].oferta.items[0]));
  assert.equal(s.proveedores[0].versiones[0].oferta.items[0].precioUnitarioNeto,'100.00');
});
test('duplicado idéntico de guardar/confirmar retorna estado sin versión/evento extra',()=>{
  let s=abrir(iniciar());
  const payload=ev('ev_guardar','guardar_borrador',B,{
    anonId:'anon_aaa',revisionEsperada:0,borrador:draft()});
  s=aplicarEventoRondaOffline(s,payload,prov('anon_aaa'));
  assert.equal(aplicarEventoRondaOffline(s,payload,prov('anon_aaa')),s);
  s=confirmar(s);
  assert.equal(aplicarEventoRondaOffline(s,ev('ev_confirmar','confirmar_oferta',C,{
    anonId:'anon_aaa',revisionEsperada:1}),prov('anon_aaa')),s);
  assert.equal(s.proveedores[0].versiones.length,1);
  assert.equal(s.eventos.length,3);
});
test('mismo ID distinto payload o distinta autoridad: error, no versión extra',()=>{
  const s=guardar(abrir(iniciar()));
  fail(()=>aplicarEventoRondaOffline(s,ev('ev_guardar','guardar_borrador',B,{
    anonId:'anon_aaa',revisionEsperada:0,borrador:draft('1.00')}),prov('anon_aaa')));
  fail(()=>aplicarEventoRondaOffline(s,ev('ev_guardar','guardar_borrador',B,{
    anonId:'anon_aaa',revisionEsperada:0,borrador:draft()}),prov('anon_bbb')));
});
test('ningún proveedor puede modificar al otro ni actuar si no fue invitado',()=>{
  const s=abrir(iniciar());
  const event=ev('ev_guardar','guardar_borrador',B,{anonId:'anon_aaa',revisionEsperada:0,borrador:draft()});
  fail(()=>aplicarEventoRondaOffline(s,event,prov('anon_bbb')));
  fail(()=>aplicarEventoRondaOffline(s,event,prov('anon_notinvited')));
  fail(()=>aplicarEventoRondaOffline(s,event,comprador));
  fail(()=>aplicarEventoRondaOffline(s,ev('ev_confirmar','confirmar_oferta',C,{anonId:'anon_aaa',revisionEsperada:1}),comprador));
});
test('roles de apertura, cierre y cancelación restringidos',()=>{
  const s=iniciar();
  fail(()=>aplicarEventoRondaOffline(s,ev('ev_open','abrir',A),sistema));
  fail(()=>aplicarEventoRondaOffline(s,ev('ev_open','abrir',A),prov('anon_aaa')));
  fail(()=>aplicarEventoRondaOffline(s,ev('ev_cancel','cancelar',A),prov('anon_aaa')));
  fail(()=>aplicarEventoRondaOffline(s,ev('ev_cancel','cancelar',A),sistema));
  fail(()=>aplicarEventoRondaOffline(s,ev('ev_close','cerrar',Z),sistema));
});
test('cancelación irreversible; sin reapertura ni nuevas ofertas',()=>{
  const s=aplicarEventoRondaOffline(abrir(iniciar()),ev('ev_cancelar','cancelar',B),comprador);
  assert.equal(s.estado,'cancelada');assert.equal(s.comparacionCierre,null);
  fail(()=>guardar(s));fail(()=>cerrar(s));
  fail(()=>aplicarEventoRondaOffline(s,ev('ev_abrir2','abrir',C),comprador));
});
test('no se permite abrir fuera de plazo, ni confirmar después del cierre',()=>{
  const s=iniciar();
  fail(()=>aplicarEventoRondaOffline(s,ev('ev_abrir','abrir','2026-10-31T00:00:00.000Z'),comprador));
  fail(()=>aplicarEventoRondaOffline(s,ev('ev_abrir','abrir',Z),comprador));
  const ab=abrir(s);
  fail(()=>aplicarEventoRondaOffline(ab,ev('ev_cerrar','cerrar',B),sistema));
  fail(()=>guardar(ab,'anon_aaa',0,Z));
  fail(()=>confirmar(ab,'anon_aaa',0,Z));
  const fin=cerrar(ab);
  fail(()=>guardar(fin));
  fail(()=>aplicarEventoRondaOffline(fin,ev('ev_cancelar','cancelar',E),comprador));
});
test('revisiones obsoletas y confirmación duplicada con otro ID se rechazan',()=>{
  let s=guardar(abrir(iniciar()));
  fail(()=>guardar(s,'anon_aaa',0,C,draft('12.00'),'ev_stale'));
  fail(()=>confirmar(s,'anon_aaa',0,C,'ev_staleconfirm'));
  s=confirmar(s);
  fail(()=>confirmar(s,'anon_aaa',1,D,'ev_confirm_again'));
});
test('sin borrador no hay confirmación de oferta',()=>{
  const s=abrir(iniciar());
  fail(()=>confirmar(s));
});
test('dos proveedores: el cierre usa la última versión confirmada por cada uno',()=>{
  let s=confirmar(guardar(abrir(iniciar())));
  const barato={...draft(),items:draft().items.map(x=>({...x,precioUnitarioNeto:'70.00'}))};
  s=guardar(s,'anon_bbb',0,D,barato,'ev_b');
  s=confirmar(s,'anon_bbb',1,D,'ev_bconfirm');
  s=cerrar(s);
  assert.deepEqual(s.comparacionCierre.cobertura.map(x=>x.anonId),['anon_aaa','anon_bbb']);
  assert.equal(s.comparacionCierre.opcionesCompletas[0].proveedoresAnonimos[0],'anon_bbb');
});
test('precio incompleto no se inventa: oferta confirmada puede quedar sin total',()=>{
  let s=guardar(abrir(iniciar()),'anon_aaa',0,B,
    draft(null,{fleteFinal:null}));s=confirmar(s);s=cerrar(s);
  assert.equal(s.proveedores[0].versiones.length,1);
  assert.equal(s.comparacionCierre.cobertura[0].totalComparable,null);
  assert.equal(s.comparacionCierre.opcionesCompletas.length,0);
});
test('alternativa no verificada no pasa a equivalente por confirmar',()=>{
  const x=draft('1.00'); x.items[0].equivalencia='sin_verificar';
  let s=guardar(abrir(iniciar()),'anon_aaa',0,B,x);
  s=confirmar(s);s=cerrar(s);
  assert.equal(s.comparacionCierre.opcionesCompletas.length,0);
  assert.equal(s.comparacionCierre.cobertura[0].lineas[0].motivo,'equivalencia_no_verificada');
});
test('entrada con PII o atributos extra se bloquea antes de guardar',()=>{
  const s=abrir(iniciar());
  fail(()=>guardar(s,'anon_aaa',0,B,{...draft(),telefono:'221123456'}));
  fail(()=>guardar(s,'anon_aaa',0,B,{...draft(),items:[{...draft().items[0],contacto:'Proveedor A'}]}));
  fail(()=>aplicarEventoRondaOffline(s,{...ev('ev_fake','guardar_borrador',B,{anonId:'anon_aaa',revisionEsperada:0,borrador:draft()}),cliente:'ajeno'},prov('anon_aaa')));
  fail(()=>aplicarEventoRondaOffline(s,ev('ev_fake','guardar_borrador',B,{anonId:'anon_aaa',revisionEsperada:0,borrador:draft()}),{rol:'proveedor',anonId:'anon_aaa',admin:true}));
});
test('configuración inicial y timestamps incorrectos fallan cerrado',()=>{
  fail(()=>iniciar({autorizacionDistribucion:false}));
  fail(()=>iniciar({inicioEn:Z,cierreEn:A}));
  fail(()=>iniciar({inicioEn:'2026-11-01 10:00'}));
  fail(()=>iniciar({invitadosAnonimos:['anon_aaa','anon_aaa']}));
  fail(()=>iniciar({invitadosAnonimos:['anon_aaa','corralon_001']}));
  fail(()=>iniciar({invitadosAnonimos:[]}));
  fail(()=>iniciar({pedido:{items:[]}}));
  fail(()=>iniciar({nombreProveedor:'filtrado'}));
  const s=abrir(iniciar());
  fail(()=>guardar(s,'anon_aaa',0,'ayer'));
  fail(()=>guardar(s,'anon_aaa',0,'2026-10-30T11:00:00.000Z'));
});
test('hasta 10 invitados, no se incluyen contactos ni acciones de red',()=>{
  const ids=Array.from({length:10},(_,i)=>'anon_'+String(i+100));
  const s=iniciar({invitadosAnonimos:ids});
  assert.equal(s.proveedores.length,10);
  fail(()=>iniciar({invitadosAnonimos:[...ids,'anon_extra']}));
  assert.equal(JSON.stringify(s).includes('telefono'),false);
  assert.equal(JSON.stringify(s).includes('whatsapp'),false);
});

test('payload null y autoridad ausente se rechazan con error controlado',()=>{
  const s=abrir(iniciar());
  fail(()=>aplicarEventoRondaOffline(s,null,comprador));
  fail(()=>aplicarEventoRondaOffline(s,ev('ev_sin_rol','cancelar',B),null));
  fail(()=>aplicarEventoRondaOffline(s,ev('ev_sin_rol','cancelar',B),{}));
});
test('el mismo evento de cierre repetido se deduplica sin cambiar el snapshot',()=>{
  const s=cerrar(confirmar(guardar(abrir(iniciar()))));
  const repeat=ev('ev_cerrar','cerrar',Z);
  assert.equal(aplicarEventoRondaOffline(s,repeat,sistema),s);
  assert.equal(s.eventos.length,4);
});
test('corrección pendiente al cierre no reemplaza la última oferta confirmada',()=>{
  let s=confirmar(guardar(abrir(iniciar())));
  s=guardar(s,'anon_aaa',1,D,draft('1.00'),'ev_corregir_sin_confirmar');
  s=cerrar(s);
  assert.equal(s.proveedores[0].versiones.length,1);
  assert.equal(s.proveedores[0].borrador.items[0].precioUnitarioNeto,'1.00');
  assert.equal(s.comparacionCierre.opcionesCompletas[0].totalFinal,'1341.00');
});
