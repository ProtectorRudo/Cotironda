import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {vistaPresupuestosAnonimosMvp076 as anonimizar,
 prepararAvisosFinalistasMvp076 as preparar}
 from '../../src/domain/anonimato-y-avisos-mvp076.ts';
import {extraerPlazoCotizacionMvp053 as extraer}
 from '../../src/domain/plazo-cotizacion-mvp053.ts';

const dia='2026-11-10T00:00:00.000Z';
const now='2026-11-10T00:00:00.000Z';
const l=(precio)=>({itemId:'cemento_cpc',unidad:'bag',cantidadDisponible:'20',
 equivalencia:'verificada',precioUnitarioNeto:precio,ivaPorcentaje:'21'});
const quote=(anonId,precio,more={})=>({
 anonId,version:1,confirmada:true,moneda:'ARS',formaPago:'transferencia',
 plazoEntregaDias:3,fleteFinal:'1000.00',minimoCompraFinal:'0.00',
 items:[l(precio)],...more
});
const supplier=(id,phone)=>({id,nombre:'Corralón '+id.split('_')[1],
 whatsapp:phone,compartirConsentido:true,
 identidadVerificada:true,contactoVigente:true,activo:true});
const buyer=()=>({id:'arquitecto',nombre:'Arquitecto Comercial',whatsapp:'5492211111111',
 compartirConsentido:true,identidadVerificada:true,contactoVigente:true,activo:true});
const vendor=()=>[
 supplier('anon_ailin','5492212222222'),
 supplier('anon_nahuel','5492213333333'),
 supplier('anon_luis','5492214444444')
];
function input(){
 const providers=vendor();
 return {cierre:{estadoRonda:'cerrada',cierreEn:dia,ahoraServidor:now,
   compradorAceptoCompartirContacto:true,rubros:[{
   codigo:'corralon',pedido:{items:[{id:'cemento_cpc',cantidad:'20',unidad:'bag'}]},
   proveedores:providers.map(x=>({
    anonId:x.id,contactoConsentido:true,identidadVerificada:true,
    contactoVigente:true,activo:true})),
   ofertas:[quote('anon_ailin','10000.00'),quote('anon_nahuel','10500.00'),
     quote('anon_luis','20000.00')]
 }]},comprador:buyer(),proveedores:providers};
}
test('MVP076: nuevo plazo por defecto de 4 días y explícito 3-7',()=>{
 const x=extraer('20 bolsas de cemento\nEntrega: La Plata');
 assert.equal(x.dias,4);assert.equal(x.explicito,false);
 assert.equal(extraer('20 bolsas de cemento\nPlazo: 7 días').dias,7);
});

test('MVP076: vista anonimizada nunca incluye id vendedor, nombre o contactos',()=>{
 const offers=[{idInterno:'anon_ailin',revision:1,verificada:true,
  lineas:[{articuloId:'cemento_cpc',cantidad:'20',unidad:'bag',
    precioUnitario:'10000.00',importeLinea:'200000.00'}]}];
 const x=anonimizar(offers);
 assert.equal(x.ofertas[0].etiqueta,'Proveedor A');
 assert.equal(x.ofertas[0].lineas[0].importeLinea,'200000.00');
 assert.equal(JSON.stringify(x).includes('ailin'),false);
 assert.equal(JSON.stringify(x).includes('whatsapp'),false);
 assert.equal(Object.isFrozen(x.ofertas[0].lineas),true);
});
test('MVP076: oferta no verificada no expone texto/precio original',()=>{
 const x=anonimizar([{idInterno:'anon_ailin',revision:2,
  verificada:false,lineas:[]}]);
 assert.equal(x.ofertas[0].verificada,false);
 assert.deepEqual(x.ofertas[0].lineas,[]);
});
test('MVP076: metadata inesperada, teléfono como artículo, precio inválido o IDs duplicados se rechazan',()=>{
 const valid={idInterno:'anon_ailin',revision:1,verificada:true,lineas:[{
  articuloId:'cemento_cpc',cantidad:'20',unidad:'bag',
  precioUnitario:'10000.00',importeLinea:'200000.00'
 }]};
 for(const offer of [
  {...valid,telefono:'5492210000000'},
  {...valid,lineas:[{...valid.lineas[0],articuloId:'5492210000000'}]},
  {...valid,lineas:[{...valid.lineas[0],precioUnitario:'$200.000'}]},
  {...valid,lineas:[{...valid.lineas[0],originalQuote:'+5492210000000'}]}
 ])assert.throws(()=>anonimizar([offer]),/mvp076_entrada_invalida/);
 assert.throws(()=>anonimizar([valid,valid]),/mvp076_entrada_invalida/);
});

test('MVP076: dos finalistas reciben contacto del comprador; comprador recibe dos contactos, tercero ninguno',()=>{
 const x=preparar(input());
 assert.equal(x.estado,'preparado_sin_enviar');
 assert.equal(x.avisos.length,4);
 const sends=x.avisos.filter(a=>a.tipo==='finalista');
 const replies=x.avisos.filter(a=>a.tipo==='comprador');
 assert.deepEqual(sends.map(a=>a.destinatarioId),['anon_ailin','anon_nahuel']);
 assert.equal(sends.every(a=>a.mensaje.includes('entre las dos propuestas finalistas')),true);
 assert.equal(sends.every(a=>a.mensaje.includes('5492211111111')),true);
 assert.equal(sends.every(a=>!a.mensaje.includes('5492213333333')),true);
 assert.equal(replies.length,2);
 assert.equal(replies.every(a=>a.destinatarioId==='arquitecto'),true);
 assert.equal(JSON.stringify(x).includes('5492214444444'),false);
 assert.equal(x.envioWhatsApp,false);
 assert.equal(x.contactosPublicados,false);
 assert.equal(x.adjudicacion,false);
});
test('MVP076: antes de vencimiento o cancelación, jamás se preparan avisos',()=>{
 for(const diff of [
  {estadoRonda:'abierta'}, {estadoRonda:'cancelada'},
  {ahoraServidor:'2026-11-09T23:59:59.999Z'}
 ]){
 const x=input();x.cierre={...x.cierre,...diff};
 assert.equal(preparar(x).avisos.length,0);
 }
});
test('MVP076: consentimiento comprador o proveedor revocado impide revelación',()=>{
 const a=input();a.comprador={...a.comprador,compartirConsentido:false};
 assert.deepEqual(preparar(a).avisos,[]);
 const b=input();b.proveedores[0]={...b.proveedores[0],contactoVigente:false};
 assert.deepEqual(preparar(b).avisos,[]);
 const c=input();c.cierre={...c.cierre,compradorAceptoCompartirContacto:false};
 assert.deepEqual(preparar(c).avisos,[]);
});
test('MVP076: sin cobertura completa, IVA/flete, pago comparable o empate en corte no hay aviso',()=>{
 const partial=input();partial.cierre.rubros[0].ofertas[0].items=[];
 partial.cierre.rubros[0].ofertas[1].items=[];
 partial.cierre.rubros[0].ofertas[2].items=[];
 assert.equal(preparar(partial).avisos.length,0);
 const noIva=input();noIva.cierre.rubros[0].ofertas.forEach(o=>o.items[0].ivaPorcentaje=null);
 assert.equal(preparar(noIva).avisos.length,0);
 const unequal=input();unequal.cierre.rubros[0].ofertas[1].formaPago='contado';
 assert.equal(preparar(unequal).avisos.length,0);
 const tied=input();tied.cierre.rubros[0].ofertas[2].items[0].precioUnitarioNeto='10500.00';
 assert.equal(preparar(tied).avisos.length,0);
});
test('MVP076: solo un proveedor válido recibe mensaje como finalista, nunca dos falsos ganadores',()=>{
 const a=input();
 a.cierre.rubros[0].ofertas=a.cierre.rubros[0].ofertas.slice(0,1);
 const x=preparar(a);
 assert.equal(x.avisos.length,2);
 assert.match(x.avisos[0].mensaje,/como propuesta finalista/);
 assert.doesNotMatch(x.avisos[0].mensaje,/dos propuestas finalistas/);
});
test('MVP076: números o nombres adulterados y destinatarios duplicados se rechazan',()=>{
 const a=input();a.comprador={...a.comprador,nombre:'Arquitecto\nInvitado'};
 assert.throws(()=>preparar(a),/mvp076_entrada_invalida/);
 const b=input();b.proveedores[1]={...b.proveedores[1],whatsapp:b.proveedores[0].whatsapp};
 assert.throws(()=>preparar(b),/mvp076_entrada_invalida/);
});
test('MVP076: SQL carece de select público y prohíbe WhatsApp automático',()=>{
 const sql=readFileSync(new URL('../../supabase/piloto/mvp076_four_day_deadline_private.sql',import.meta.url),'utf8');
 const guards=readFileSync(new URL('../../supabase/piloto/mvp076b_deadline_whapi_guards.sql',import.meta.url),'utf8');
 assert.match(sql,/interval '96 hours'/);
 assert.match(sql,/for update skip locked limit p_limit/);
 assert.match(sql,/revoke all on function public.cotironda_piloto_close_due_v1/);
 assert.match(sql,/grant execute on function public.cotironda_piloto_close_due_v1\(integer\) to service_role/);
 assert.match(sql,/'reveal_performed',false/);
 assert.match(sql,/'winners_chosen',false/);
 assert.match(guards,/r\.closes_at>clock_timestamp\(\)/);
 assert.doesNotMatch(sql,/https:\/\/|gate\.whapi\.cloud/);
});
