/**
 * D015 — Puente entre extracción de IA validada y producto canónico.
 * Registros CURADOS de laboratorio, nunca equivalencias técnicas certificadas.
 * Sin WhatsApp, efectos ni inferencia remota.
 */
import type {BorradorDocumental,LineaDocumental} from './extraccion-documental.ts';
import type {SolicitudAutomatica} from './despacho-automatico.ts';
import type {Rubro} from './catalogo.ts';
import type {ProveedorPorProducto,AtributoCritico} from './identidad-producto.ts';
import {planificarInvitacionesPorProducto,type RequisitoInvitacion,
  type PlanInvitacionPorProducto} from './invitaciones-por-producto.ts';

export const VERSION_TAXONOMIA='obra_ar_v1_2026_10_30' as const;
type Regla=Readonly<{producto_id:string;rubro:Rubro;aliases:readonly string[];excluye:readonly string[]}>;
export const PRODUCTOS_CANONICOS:readonly Regla[]=[
  {producto_id:'cemento_gris_obra',rubro:'corralon',
    aliases:['cemento','cementos'],
    excluye:['cemento de contacto','cemento cola','cemento adhesivo','adhesivo cementicio',
      'cemento blanco','cemento refractario','cemento rapido','cemento alisado',
      'cemento plastico','cemento asfaltico','pintura color cemento','color cemento',
      'mortero de cemento','pegamento para cemento']},
  {producto_id:'hidrofugo',rubro:'corralon',
    aliases:['hidrofugo','hidrofugos','ceresita'],
    excluye:['pintura hidrofuga','membrana hidrofuga','revestimiento hidrofugo']},
  {producto_id:'pintura_latex',rubro:'pintureria',
    aliases:['latex','pintura latex'],
    excluye:['guantes de latex','adhesivo latex','sellador latex','membrana latex']},
  {producto_id:'placa_yeso',rubro:'construccion_seco',
    aliases:['placa de yeso','placas de yeso','placa yeso','placas yeso',
      'placa durlock','placas durlock'],
    excluye:['tornillo para placa de yeso','masilla para placa de yeso',
      'perfil para placa de yeso','adhesivo para placa de yeso']},
  {producto_id:'cable_unipolar',rubro:'electricidad',
    aliases:['cable unipolar','cables unipolares','cable electrico','cables electricos'],
    excluye:['cable de acero','cable de freno','cable coaxial','cable de red',
      'cable de datos','cable usb']},
  {producto_id:'cano_pvc',rubro:'sanitarios',
    aliases:['cano pvc','canos pvc','cano de pvc','canos de pvc','tubo pvc','tubos pvc'],
    excluye:['cano de pvc electrico','conduit pvc','cano corrugado electrico']}
];
const canon=(s:string):string=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('es-AR').replace(/\s+/g,' ').trim();
const escapeR=(s:string):string=>s.replace(/[.*+?^$()|[\]{}\\]/g,'\\$&');
const frase=(texto:string,term:string):boolean=>{
  const p=escapeR(canon(term)).replace(/\s+/g,'\\s+');
  return new RegExp('(?:^|[^a-z0-9])'+p+'(?=$|[^a-z0-9])','u').test(canon(texto));
};
const textoValido=(s:unknown):s is string=>typeof s==='string'&&s.length>=2&&
  s.length<=300&&!/[\u0000-\u001f]/.test(s);
const atributo=(codigo:string,valor:string):AtributoCritico=>({codigo,valor});
const reglas=(s:string)=>PRODUCTOS_CANONICOS.flatMap(r=>{
  if(r.excluye.some(t=>frase(s,t)))return [];
  const evidencia=r.aliases.find(t=>frase(s,t));
  return evidencia?[{regla:r,evidencia}]:[];
});
export function identificarProducto(descripcion:string):
  {producto_id:string;rubro:Rubro;evidencia:string}|null {
  if(!textoValido(descripcion))return null;
  const coincidencias=reglas(descripcion);
  if(coincidencias.length!==1)return null;
  const {regla,evidencia}=coincidencias[0];
  return{producto_id:regla.producto_id,rubro:regla.rubro,evidencia};
}
function exclusividadExpresa(s:string,marca:string|null):boolean {
  const normal=canon(s);
  if(/(?:^|[^a-z])(?:sin sustitutos|sin reemplazos|no acepto otras marcas|no aceptar otras marcas|marca obligatoria|marca exclusiva)(?:$|[^a-z])/.test(normal))return true;
  if(!marca)return false;
  const buscar=escapeR(canon(marca)).replace(/\s+/g,'\\s+');
  return new RegExp('(?:solo|solamente|unicamente|exclusivamente)\\s+(?:marca\\s+)?'+buscar+'(?=$|[^a-z0-9])','u').test(normal);
}
function atributosFuente(s:string,producto:string):readonly AtributoCritico[]{
  const n=canon(s),r:AtributoCritico[]=[];
  const una=(codigo:string,valores:string[])=>{
    const x=valores.filter(v=>frase(n,v));
    if(x.length===1)r.push(atributo(codigo,x[0]));
  };
  if(producto==='cemento_gris_obra')una('tipo',['cpc','cpn','cpp']);
  if(producto==='placa_yeso'){
    una('clase',['rh','rf','st']);
    const mm=[...n.matchAll(/(\d{1,2}(?:[.,]\d{1,2})?)\s*mm\b/g)];
    if(mm.length===1)r.push(atributo('espesor_mm',mm[0][1].replace(',','.')));
  }
  if(producto==='pintura_latex'){
    una('uso',['interior','exterior']);una('terminacion',['mate','satinado','brillante']);
  }
  if(producto==='cable_unipolar'){
    const mm=[...n.matchAll(/(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:mm2|mm²)(?=$|[^a-z0-9])/gu)];
    if(mm.length===1)r.push(atributo('seccion_mm2',mm[0][1].replace(',','.')));
    una('aislacion',['pvc','xlpe']);
  }
  return r;
}
function contenidoSolicitado(l:LineaDocumental,producto:string):{
  unidad_base:RequisitoInvitacion['unidad_base'];
  contenido_por_unidad_solicitada:string|null
}{
  if(l.unidad==='kg'||l.unidad==='l'||l.unidad==='m'||l.unidad==='m2')
    return{unidad_base:l.unidad,contenido_por_unidad_solicitada:'1'};
  if(l.unidad==='unit'&&producto==='placa_yeso')
    return{unidad_base:'unit',contenido_por_unidad_solicitada:'1'};
  if(l.unidad==='bag'&&producto==='cemento_gris_obra'){
    const bolsas=[...canon(l.descripcion_original).matchAll(/\b(\d{1,3})\s*kg\b/g)];
    if(bolsas.length===1&&['25','35','40','50'].includes(bolsas[0][1]))
      return{unidad_base:'kg',contenido_por_unidad_solicitada:bolsas[0][1]};
  }
  return{unidad_base:null,contenido_por_unidad_solicitada:null};
}
export type MotivoIdentidad='producto_no_identificable'|'producto_ambiguo'|
  'rubro_incompatible'|'marca_exclusiva_sin_identificar'|'datos_documentales_inseguros';
export type ResolucionProducto=Readonly<{
  version:typeof VERSION_TAXONOMIA;
  borrador:BorradorDocumental;
  requisitos:RequisitoInvitacion[];
  retenidas:{fila:number;motivo:MotivoIdentidad}[];
  marcas_no_exclusivas_corregidas:number[];
  marcas_exclusivas_verificadas:number[];
}>;
export function resolverProductosDeBorrador(borrador:BorradorDocumental):ResolucionProducto{
  if(borrador?.estado!=='pendiente_despacho_automatico'||
    !Array.isArray(borrador.lineas)||borrador.lineas.length>100||
    !Array.isArray(borrador.posibles_duplicados))
    throw new TypeError('borrador_no_valido_para_productos');
  const requisitos:RequisitoInvitacion[]=[];
  const retenidas:{fila:number;motivo:MotivoIdentidad}[]=[];
  const corregidas:number[]=[],exclusivas:number[]=[];
  const lineas=borrador.lineas.map(l=>{
    if(!textoValido(l.descripcion_original)){
      retenidas.push({fila:l.fila,motivo:'datos_documentales_inseguros'});return l;
    }
    const matches=reglas(l.descripcion_original);
    if(matches.length!==1){
      retenidas.push({fila:l.fila,motivo:matches.length?'producto_ambiguo':'producto_no_identificable'});
      return l;
    }
    const {regla}=matches[0];
    if(l.rubro!==regla.rubro){
      retenidas.push({fila:l.fila,motivo:'rubro_incompatible'});return l;
    }
    const marca=typeof l.marca==='string'&&frase(l.descripcion_original,l.marca)?l.marca:null;
    const explicit=exclusividadExpresa(l.descripcion_original,marca);
    if(explicit&&!marca){
      retenidas.push({fila:l.fila,motivo:'marca_exclusiva_sin_identificar'});return l;
    }
    const warnings=l.requiere_aclaracion.filter(x=>!
      (x==='marca_obligatoria_sin_marca'&&!explicit));
    if(warnings.length)retenidas.push({fila:l.fila,motivo:'datos_documentales_inseguros'});
    if(l.marca_obligatoria&&!explicit)corregidas.push(l.fila);
    if(explicit)exclusivas.push(l.fila);
    const nuevo:LineaDocumental={...l,marca:marca??l.marca,
      marca_obligatoria:explicit,requiere_aclaracion:warnings};
    const paquete=contenidoSolicitado(nuevo,regla.producto_id);
    requisitos.push({
      fila:l.fila,descripcion_original:l.descripcion_original,
      producto_id:regla.producto_id,rubro:regla.rubro,
      atributos_solicitados:atributosFuente(l.descripcion_original,regla.producto_id),
      ...paquete
    });
    return nuevo;
  });
  return{version:VERSION_TAXONOMIA,borrador:{...borrador,lineas},
    requisitos,retenidas,marcas_no_exclusivas_corregidas:corregidas,
    marcas_exclusivas_verificadas:exclusivas};
}
export function simularInvitacionesDesdeBorrador(args:{
  solicitud:SolicitudAutomatica;
  borrador:BorradorDocumental;
  proveedores:readonly ProveedorPorProducto[];
}):{estado:'simulacion_taxonomia_sin_envio';resolucion:ResolucionProducto;plan:PlanInvitacionPorProducto}{
  const resolucion=resolverProductosDeBorrador(args.borrador);
  const plan=planificarInvitacionesPorProducto({
    solicitud:args.solicitud,borrador:resolucion.borrador,
    requisitos:resolucion.requisitos,proveedores:args.proveedores
  });
  return{estado:'simulacion_taxonomia_sin_envio',resolucion,plan};
}
