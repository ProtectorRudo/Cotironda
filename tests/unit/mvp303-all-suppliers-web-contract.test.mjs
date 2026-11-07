import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const proxy=readFileSync(new URL(
 '../../piloto/seguimiento-web/api/estado.js',import.meta.url),'utf8');
const beforeDefault=proxy.split('export default async function handler')[0];
const start=beforeDefault.indexOf('function buyerView(parsed){');
const view=runInNewContext(beforeDefault.slice(start)+'\nbuyerView');
const web=readFileSync(new URL(
 '../../piloto/seguimiento-web/site.js',import.meta.url),'utf8');
const html=readFileSync(new URL(
 '../../piloto/seguimiento-web/index.html',import.meta.url),'utf8');
const edge=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-seguimiento/index.ts',
 import.meta.url),'utf8');
const roster=()=>({
 state:'proveedores_revelados_al_cierre',cantidad:4,invitados:4,
 solo_post_cierre:true,identidades_reveladas:true,
 telefonos_revelados:false,ranking_global_permitido:false,
 adjudicacion_automatica:false,mensajes_enviados:false,
 proveedores:[
  {nombre:'Corralón Buenos Aires',oferta:'Presupuesto 1',
   estado:'presupuesto_verificado'},
  {nombre:'Pinturería del Barrio',oferta:'Presupuesto 2',
   estado:'presupuesto_verificado'},
  {nombre:'Electricidad Zona Norte',oferta:null,
   estado:'envio_no_confirmado'},
  {nombre:'Ferretería Litoral',oferta:null,estado:'sin_respuesta'}
 ]
});
test('MVP303: Vercel deja pasar 4 empresas y sin adjudicación luego del cierre',()=>{
 const result=view({state:'closed',can_open:false,todos_proveedores_cierre:roster()});
 assert.equal(result.state,'closed');
 assert.equal(result.can_open,false);
 assert.equal(result.todos_proveedores_cierre.cantidad,4);
 assert.equal(result.todos_proveedores_cierre.proveedores.length,4);
 assert.equal(result.todos_proveedores_cierre.telefonos_revelados,false);
 assert.equal(result.todos_proveedores_cierre.adjudicacion_automatica,false);
 assert.ok(!JSON.stringify(result).includes('supplier_key'));
});
test('MVP303: nunca se identifican comercios cuando todavía está abierta',()=>{
 assert.equal(view({state:'waiting',can_open:true,
  todos_proveedores_cierre:roster()}),null);
 assert.equal(view({state:'cancelled',can_open:false}).state,'cancelled');
 assert.equal(view({state:'not_found'}).state,'not_found');
 assert.equal(view({state:'waiting',can_open:true}).todos_proveedores_cierre,undefined);
});
test('MVP303: proxy rechaza teléfonos, identificadores internos y falsos cierres',()=>{
 const cases=[
  r=>{r.telefonos_revelados=true},
  r=>{r.ranking_global_permitido=true},
  r=>{r.adjudicacion_automatica=true},
  r=>{r.mensajes_enviados=true},
  r=>{r.solo_post_cierre=false},
  r=>{r.cantidad=2},
  r=>{r.proveedores[0].phone='2214000000'},
  r=>{r.proveedores[0].supplier_key='supplier'},
  r=>{r.proveedores[0].nombre='<script>x</script>'},
  r=>{r.proveedores[1].oferta='Presupuesto 1'},
  r=>{r.proveedores[0].estado='ganador'},
  r=>{r.proveedores[2].oferta='Presupuesto 3'},
  r=>{r.proveedores[0].nombre='Corralón 5492214000000'}
 ];
 for(const change of cases){
  const r=roster();change(r);
  const result=view({state:'closed',can_open:false,
   todos_proveedores_cierre:r});
  assert.equal(result,null,JSON.stringify(r).slice(0,150));
 }
});
test('MVP303: Edge usa RPC independiente de ofertas y elimina los dos finalistas antiguos',()=>{
 assert.match(edge,/vistaProveedoresCierreMvp303/u);
 assert.match(edge,/cotironda_piloto_all_suppliers_closed_mvp303/u);
 assert.match(edge,/if\(publicResult\?\.state==='closed'\)/u);
 assert.match(edge,/todos_proveedores_cierre:reduced/u);
 assert.match(edge,/finalists:undefined,joint_supplier_coverage:undefined/u);
 assert.match(edge,/p_token_hash:digest/u);
 assert.doesNotMatch(edge,/\bMVP303\b.*\bcontactos_revelados\s*:\s*true/u);
});
test('MVP303: vista reactiva identifica cuatro negocios, sin suponer ganador',()=>{
 assert.match(web,/Todos los proveedores de la ronda/u);
 assert.match(web,/roster\.proveedores/u);
 assert.match(web,/d\.state==="closed"/u);
 assert.match(web,/!Object\.hasOwn\(statuses,p\.estado\)/u);
 assert.match(web,/element\("h3","offer-heading",p\.nombre\)/u);
 assert.match(html,/Una vez vencido el plazo y cerrada la ronda/u);
});
