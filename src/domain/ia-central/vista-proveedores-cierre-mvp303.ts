/** MVP303 · Vista estrictamente limitada de los negocios de UNA ronda.
 * Antes del cierre no hay resultado; solo se aceptan datos ya autorizados
 * por la RPC SQL service_role-only y un enlace privado del comprador.
 * Identidades de negocios sí; teléfono, IDs, precios y contactos nunca.
 */
export type ProveedorReveladoMvp303=Readonly<{
 nombre:string;
 oferta:string|null;
 estado:'presupuesto_verificado'|'respuesta_en_revision'|
  'sin_respuesta'|'envio_no_confirmado';
}>;
export type VistaProveedoresMvp303=Readonly<{
 state:'proveedores_revelados_al_cierre';
 proveedores:readonly ProveedorReveladoMvp303[];
 cantidad:number;
 invitados:number;
 solo_post_cierre:true;
 identidades_reveladas:true;
 telefonos_revelados:false;
 ranking_global_permitido:false;
 adjudicacion_automatica:false;
 mensajes_enviados:false;
}>;
const isRecord=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(r:Record<string,unknown>,fields:readonly string[])=>
 Object.keys(r).length===fields.length&&fields.every(k=>Object.hasOwn(r,k));
const schema=['state','proveedores','cantidad','invitados','solo_post_cierre',
 'identidades_reveladas','telefonos_revelados','ranking_global_permitido',
 'adjudicacion_automatica','mensajes_enviados'];
const supplierKeys=['nombre','oferta','estado'];
const permitted=new Set(['presupuesto_verificado','respuesta_en_revision',
 'sin_respuesta','envio_no_confirmado']);
const alias=/^Presupuesto (?:[1-9]|[1-9][0-9]|100)$/u;
const name=/^[^\u0000-\u001f\u007f<>]{2,100}$/u;
export function vistaProveedoresCierreMvp303(v:unknown):VistaProveedoresMvp303|null{
 if(!isRecord(v)||!exact(v,schema)||
    v.state!=='proveedores_revelados_al_cierre'||
    !Array.isArray(v.proveedores)||
    typeof v.cantidad!=='number'||!Number.isSafeInteger(v.cantidad)||v.cantidad<0||v.cantidad>100||
    typeof v.invitados!=='number'||!Number.isSafeInteger(v.invitados)||v.invitados<0||v.invitados>100||
    v.cantidad!==v.proveedores.length||v.cantidad>v.invitados||
    v.solo_post_cierre!==true||v.identidades_reveladas!==true||
    v.telefonos_revelados!==false||
    v.ranking_global_permitido!==false||
    v.adjudicacion_automatica!==false||
    v.mensajes_enviados!==false)return null;
 const rows:ProveedorReveladoMvp303[]=[],usedAliases=new Set<string>();
 for(const p of v.proveedores){
  if(!isRecord(p)||!exact(p,supplierKeys)||
     typeof p.nombre!=='string'||!name.test(p.nombre)||
     p.nombre.trim()!==p.nombre||/[0-9]{8,}/u.test(p.nombre)||
     typeof p.estado!=='string'||!permitted.has(p.estado)||
     (p.oferta!==null&&(typeof p.oferta!=='string'||!alias.test(p.oferta)))||
     (p.estado==='presupuesto_verificado')!==(p.oferta!==null)||
     (p.oferta!==null&&usedAliases.has(p.oferta)))return null;
  if(p.oferta!==null)usedAliases.add(p.oferta);
  rows.push(Object.freeze({nombre:p.nombre,oferta:p.oferta,
   estado:p.estado as ProveedorReveladoMvp303['estado']}));
 }
 return Object.freeze({
  state:'proveedores_revelados_al_cierre' as const,
  proveedores:Object.freeze(rows),cantidad:v.cantidad as number,
  invitados:v.invitados as number,solo_post_cierre:true as const,
  identidades_reveladas:true as const,
  telefonos_revelados:false as const,
  ranking_global_permitido:false as const,
  adjudicacion_automatica:false as const,
  mensajes_enviados:false as const
 });
}
