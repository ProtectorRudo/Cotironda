/**
 * MVP-076: vistas anónimas y plan de contactos RECÍPROCOS.
 * Pura, offline. SOLO backend autorizado puede recibir/usar estos planes:
 * no DB, no Whapi, no PII en vistas, no envío ni revelación automática.
 */
import {planificarFinalistasPorRubroMvp054,
 type EntradaCierreRubrosMvp054} from './finalistas-por-rubro-mvp054.ts';

type LineaVerificada=Readonly<{
 articuloId:string;cantidad:string;unidad:string;
 precioUnitario:string;importeLinea:string;
}>;
type OfertaServidor=Readonly<{
 idInterno:string;revision:number;verificada:boolean;
 lineas:readonly LineaVerificada[];
}>;
export type OfertaAnonimaMvp076=Readonly<{
 etiqueta:string;revision:number;verificada:boolean;
 lineas:readonly LineaVerificada[];
}>;
const CODE=/^[a-z][a-z0-9_]{2,49}$/u;
const AMOUNT=/^(?:0|[1-9]\d{0,9})\.\d{2}$/u;
const QTY=/^(?:0|[1-9]\d{0,7})(?:\.\d{1,3})?$/u;
const UNIT=new Set(['unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack']);
function deny():never{throw TypeError('mvp076_entrada_invalida')}
function keys(obj:unknown,wanted:readonly string[]):obj is Record<string,unknown>{
 return typeof obj==='object'&&obj!==null&&!Array.isArray(obj)&&
  Object.keys(obj).length===wanted.length&&
  Object.keys(obj).every(k=>wanted.includes(k));
}
const alpha=(i:number)=>'Proveedor '+String.fromCharCode(65+i);
/** Input is from trusted product/price ledger, NEVER from original_quote. */
export function vistaPresupuestosAnonimosMvp076(
 ofertas:readonly OfertaServidor[]
):Readonly<{estado:'vista_anonima';ofertas:readonly OfertaAnonimaMvp076[]}>{
 if(!Array.isArray(ofertas)||ofertas.length>10)deny();
 const seen=new Set<string>();
 const out:OfertaAnonimaMvp076[]=ofertas.map((o,i)=>{
  if(!keys(o,['idInterno','revision','verificada','lineas'])||
   typeof o.idInterno!=='string'||!CODE.test(o.idInterno)||
   seen.has(o.idInterno)||typeof o.revision!=='number'||!Number.isSafeInteger(o.revision)||o.revision<1||
   typeof o.verificada!=='boolean'||!Array.isArray(o.lineas)||o.lineas.length>30)deny();
  seen.add(o.idInterno);
  const ids=new Set<string>();
  const lines=o.verificada?o.lineas.map(l=>{
   if(!keys(l,['articuloId','cantidad','unidad','precioUnitario','importeLinea'])||
    typeof l.articuloId!=='string'||!CODE.test(l.articuloId)||
    ids.has(l.articuloId)||typeof l.cantidad!=='string'||!QTY.test(l.cantidad)||
    typeof l.unidad!=='string'||!UNIT.has(l.unidad)||
    typeof l.precioUnitario!=='string'||!AMOUNT.test(l.precioUnitario)||
    typeof l.importeLinea!=='string'||!AMOUNT.test(l.importeLinea))deny();
   ids.add(l.articuloId);
   // Explicitly copy ONLY whitelist fields; never expose id, quote, phone,
   // seller name, metadata, signed URL or supplier free text.
   return Object.freeze({articuloId:l.articuloId,cantidad:l.cantidad,
    unidad:l.unidad,precioUnitario:l.precioUnitario,importeLinea:l.importeLinea});
  }):[];
  return Object.freeze({etiqueta:alpha(i),revision:o.revision,
   verificada:o.verificada,lineas:Object.freeze(lines)});
 });
 return Object.freeze({estado:'vista_anonima',ofertas:Object.freeze(out)});
}

type Contacto=Readonly<{
 id:string;nombre:string;whatsapp:string;
 compartirConsentido:boolean;identidadVerificada:boolean;
 contactoVigente:boolean;activo:boolean;
}>;
type EntradaAvisos=Readonly<{
 cierre:EntradaCierreRubrosMvp054;
 comprador:Contacto;
 proveedores:readonly Contacto[];
}>;
export type AvisoPrivadoMvp076=Readonly<{
 destinatarioId:string;destinatarioWhatsapp:string;
 rubro:string;mensaje:string;tipo:'finalista'|'comprador';
}>;
export type PlanAvisosMvp076=Readonly<{
 estado:'pendiente_o_no_comparable'|'preparado_sin_enviar';
 avisos:readonly AvisoPrivadoMvp076[];
 envioWhatsApp:false;contactosPublicados:false;
 maximoFinalistasPorRubro:2;adjudicacion:false;
}>;

const CONTACT_ID=/^(?:arquitecto|anon_[a-z0-9_]{1,44})$/u;
const PHONE=/^[1-9][0-9]{8,15}$/u;
const NAME=/^[\p{L}\p{M}0-9 .,'-]{3,80}$/u;
function contact(c:Contacto):boolean{
 return keys(c,['id','nombre','whatsapp','compartirConsentido',
  'identidadVerificada','contactoVigente','activo'])&&
  typeof c.id==='string'&&CONTACT_ID.test(c.id)&&
  typeof c.nombre==='string'&&NAME.test(c.nombre)&&
  typeof c.whatsapp==='string'&&PHONE.test(c.whatsapp)&&
  [c.compartirConsentido,c.identidadVerificada,c.contactoVigente,c.activo]
    .every(x=>typeof x==='boolean');
}
function permitted(c:Contacto):boolean{
 return c.compartirConsentido&&c.identidadVerificada&&
  c.contactoVigente&&c.activo;
}
function result(avisos:AvisoPrivadoMvp076[]):PlanAvisosMvp076{
 return Object.freeze({estado:avisos.length?'preparado_sin_enviar':'pendiente_o_no_comparable',
  avisos:Object.freeze(avisos),envioWhatsApp:false as const,
  contactosPublicados:false as const,maximoFinalistasPorRubro:2 as const,
  adjudicacion:false as const});
}
/**
 * Requires server-trusted D054 input and private verified contact directory.
 * The result contains PII: must NEVER be exposed as a public API response.
 */
export function prepararAvisosFinalistasMvp076(x:EntradaAvisos):PlanAvisosMvp076{
 if(!keys(x,['cierre','comprador','proveedores'])||
  !contact(x.comprador)||x.comprador.id!=='arquitecto'||
  !Array.isArray(x.proveedores)||x.proveedores.length>10)deny();
 const byId=new Map<string,Contacto>();
 for(const p of x.proveedores){
  if(!contact(p)||p.id==='arquitecto'||byId.has(p.id)||p.whatsapp===x.comprador.whatsapp)deny();
  byId.set(p.id,p);
 }
 if(new Set(x.proveedores.map(p=>p.whatsapp)).size!==x.proveedores.length)deny();
 const cierre=planificarFinalistasPorRubroMvp054(x.cierre);
 // D054 verifies time, full coverage, IVA, freights and payment condition
 // through D039 / deterministic comparator. Never use user-supplied rank.
 if(!permitted(x.comprador)||!x.cierre.compradorAceptoCompartirContacto)
  return result([]);
 const out:AvisoPrivadoMvp076[]=[];
 const unique=new Set<string>();
 for(const rubro of cierre.resultados){
  if(rubro.estado!=='finalistas_identificados')continue;
  for(const finalistId of rubro.finalistasAnonimos){
   const p=byId.get(finalistId);
   // Failure to resolve a finalist safely blocks the WHOLE group.
   if(!p||!permitted(p))return result([]);
   const k=rubro.rubro+'|'+finalistId;
   if(unique.has(k))deny();
   unique.add(k);
   const sized=rubro.finalistasAnonimos.length===2?
    'entre las dos propuestas finalistas':'como propuesta finalista';
   out.push(Object.freeze({
    destinatarioId:p.id,destinatarioWhatsapp:p.whatsapp,rubro:rubro.rubro,
    tipo:'finalista',
    mensaje:'Cotironda: Tu presupuesto quedó seleccionado '+sized+
     ' del rubro '+rubro.rubro+'. No implica compra adjudicada.\n'+
     'Contacto del comprador: '+x.comprador.nombre+
     '\nWhatsApp: +'+x.comprador.whatsapp+
     '\nPueden comunicarse directamente para coordinar.'
   }));
   out.push(Object.freeze({
    destinatarioId:x.comprador.id,destinatarioWhatsapp:x.comprador.whatsapp,
    rubro:rubro.rubro,tipo:'comprador',
    mensaje:'Cotironda: Cerró la ronda del rubro '+rubro.rubro+
     '. Propuesta finalista: '+p.nombre+
     '\nWhatsApp comercial: +'+p.whatsapp+
     '\nEl contacto no implica adjudicación.'
   }));
  }
 }
 return result(out);
}
