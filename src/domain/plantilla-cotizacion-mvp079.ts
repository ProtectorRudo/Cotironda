/**
 * MVP079: plantilla PROPIA de Cotironda. Datos para una vista de ensayo,
 * nunca el PDF/Excel/imagen/texto sin filtrar del vendedor.
 *
 * Cada renglón comercial mostrado es una COPIA LITERAL del original.
 * Un renglón no clasificado, potencialmente identificatorio o con importe
 * oculto bloquea TODA la oferta. La aprobación de privacidad debe venir
 * de un proceso autorizado, no de entrada libre del comprador/proveedor.
 * No es todavía un endpoint ni lector de Supabase/PDF/Excel.
 */
import {auditarCotizacionTextoMvp075} from './auditoria-cotizacion-texto-mvp075.ts';

export type CategoriaRenglonMvp079 =
 'material'|'adicional'|'embalaje'|'flete'|'descuento'|
 'impuesto'|'aclaracion'|'subtotal'|'total'|'privado'|'vacio';
export type RenglonClasificadoMvp079=Readonly<{
 numeroLinea:number;
 categoria:CategoriaRenglonMvp079;
}>;
export type FuenteOfertaMvp079=Readonly<{
 idInterno:string;
 revision:number;
 textoOriginal:string;
 privacidad:'revisada_por_servidor'|'pendiente';
 lineas:readonly RenglonClasificadoMvp079[];
}>;
export type RenglonVisibleMvp079=Readonly<{
 numeroLinea:number;
 categoria:Exclude<CategoriaRenglonMvp079,'privado'|'vacio'>;
 textoLiteral:string;
 importeComprobable:string|null;
}>;
export type OfertaPlantillaMvp079=Readonly<{
 etiqueta:string;
 revision:number;
 estado:'lista_para_vista'|'retenida_por_verificacion';
 renglones:readonly RenglonVisibleMvp079[];
 totalLiteral:string|null;
 totalVerificado:boolean;
 estadoIva:string;
 estadoFlete:string;
 costoComparableCalculado:false;
 identidadRevelada:false;
}>;
export type PlantillasMvp079=Readonly<{
 estado:'presentacion_cotironda_no_adjudicacion';
 ofertas:readonly OfertaPlantillaMvp079[];
 originalExpuesto:false;
 envioWhatsapp:false;
}>;
const CODE=/^[a-z][a-z0-9_]{2,49}$/u;
const ALLOWED=new Set<CategoriaRenglonMvp079>([
 'material','adicional','embalaje','flete','descuento',
 'impuesto','aclaracion','subtotal','total','privado','vacio'
]);
const RISK=[
 /(?:https?:\/\/|www\.|@[a-z0-9_]{2,}|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/iu,
 /(?:\+?\s*54[\s()-]*)?(?:\d[\s().-]*){9,}/u,
 /\b(?:whats?app|tel[eé]fono|celular|contacto|cuit|cbu|domicilio|direcci[oó]n|instagram|sucursal|raz[oó]n social|matr[ií]cula|alias bancario)\b/iu,
 /\b(?:corral[oó]n|pinturer[ií]a|ferreter[ií]a|comercializadora|empresa proveedora|presupuesto de)\b/iu
];
// RISK is a fail-closed screening aid, NOT proof of identity absence.
// In production only an independently audited privacy gate may approve.
function unsafe(x:string):boolean{
 const sinImportes=x.replace(/\$\s*[0-9][0-9.,]*/gu,'MONTO');
 return RISK.some(re=>re.test(sinImportes));
}
function keys(x:unknown,ks:readonly string[]):boolean{
 return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).length===ks.length&&Object.keys(x).every(k=>ks.includes(k));
}
function fail():never{throw TypeError('mvp079_entrada_invalida')}
function held(etiqueta:string,revision:number):OfertaPlantillaMvp079{
 return Object.freeze({etiqueta,revision,estado:'retenida_por_verificacion',
  renglones:Object.freeze([]) as readonly RenglonVisibleMvp079[],
  totalLiteral:null,totalVerificado:false,estadoIva:'no_verificado',
  estadoFlete:'no_verificado',costoComparableCalculado:false as const,
  identidadRevelada:false as const});
}
const tag=(i:number)=>'Proveedor '+String.fromCharCode(65+i);
export function crearPlantillasAnonimasMvp079(
 ofertas:readonly FuenteOfertaMvp079[]
):PlantillasMvp079{
 if(!Array.isArray(ofertas)||ofertas.length>10)fail();
 const seen=new Set<string>();
 const out=ofertas.map((o,i):OfertaPlantillaMvp079=>{
  if(!keys(o,['idInterno','revision','textoOriginal','privacidad','lineas'])||
   typeof o.idInterno!=='string'||!CODE.test(o.idInterno)||
   seen.has(o.idInterno)||!Number.isSafeInteger(o.revision)||
   o.revision<1||o.revision>100||typeof o.textoOriginal!=='string'||
   !['revisada_por_servidor','pendiente'].includes(o.privacidad)||
   !Array.isArray(o.lineas)||o.lineas.length>350)fail();
  seen.add(o.idInterno);
  const etiqueta=tag(i);
  // No intentar interpretar/mostrar parcialmente una oferta sin revisión.
  if(o.privacidad!=='revisada_por_servidor')return held(etiqueta,o.revision);
  const audit=auditarCotizacionTextoMvp075(o.textoOriginal);
  if(o.lineas.length!==audit.lineas.length)return held(etiqueta,o.revision);
  const byNum=new Map<number,CategoriaRenglonMvp079>();
  for(const x of o.lineas){
   if(!keys(x,['numeroLinea','categoria'])||
    !Number.isSafeInteger(x.numeroLinea)||x.numeroLinea<1||
    x.numeroLinea>audit.lineas.length||byNum.has(x.numeroLinea)||
    typeof x.categoria!=='string'||!ALLOWED.has(x.categoria))fail();
   byNum.set(x.numeroLinea,x.categoria);
  }
  const rows:RenglonVisibleMvp079[]=[];
  let flagged=false;
  let totalLines=0;
  for(const l of audit.lineas){
   const category=byNum.get(l.numero);
   if(category===undefined){flagged=true;break}
   // No ocultar montos ni notas comerciales bajo una falsa cabecera privada.
   if(category==='privado'){
    if(l.importesLiterales.length>0||l.tipo!=='nota'||!unsafe(l.textoExacto)){
     flagged=true;break;
    }
    continue;
   }
   if(category==='vacio'){
    if(l.textoExacto.trim()!==''||l.importesLiterales.length>0){
     flagged=true;break;
    }
    continue;
   }
   if(l.textoExacto.length>500||unsafe(l.textoExacto)){flagged=true;break}
   if(l.tipo==='total'&&category!=='total'){flagged=true;break}
   if(category==='total'){
    if(l.tipo!=='total'){flagged=true;break}
    totalLines++;
   }
   if(l.tipo==='flete'&&category!=='flete'||
      l.tipo==='descuento'&&category!=='descuento'||
      l.tipo==='embalaje'&&category!=='embalaje'||
      l.tipo==='impuesto'&&category!=='impuesto'||
      l.tipo==='subtotal'&&category!=='subtotal'){flagged=true;break}
   if(category==='material'&&l.tipo!=='concepto'||
      category==='embalaje'&&l.tipo!=='embalaje'||
      category==='flete'&&l.tipo!=='flete'||
      category==='descuento'&&l.tipo!=='descuento'||
      category==='impuesto'&&l.tipo!=='impuesto'||
      category==='aclaracion'&&l.tipo!=='nota'||
      category==='adicional'&&l.tipo!=='concepto'||
      category==='subtotal'&&l.tipo!=='subtotal'){flagged=true;break}
   rows.push(Object.freeze({
    numeroLinea:l.numero,categoria:category,
    textoLiteral:l.textoExacto,
    importeComprobable:l.importeVerificable
   }));
  }
  // Si no existe TOTAL declarado, mostrarlo expresamente como no informado.
  // Dos totales distintos o repetidos son ambiguos y no se publican.
  if(flagged||totalLines>1)return held(etiqueta,o.revision);
  return Object.freeze({
   etiqueta,revision:o.revision,estado:'lista_para_vista',
   renglones:Object.freeze(rows),
   totalLiteral:audit.totalDeclaradoLiteral,
   totalVerificado:audit.estadoTotal==='explicitamente_verificado',
   estadoIva:audit.estadoIva,estadoFlete:audit.estadoFlete,
   costoComparableCalculado:false as const,identidadRevelada:false as const
  });
 });
 return Object.freeze({estado:'presentacion_cotironda_no_adjudicacion',
  ofertas:Object.freeze(out),originalExpuesto:false as const,
  envioWhatsapp:false as const});
}
