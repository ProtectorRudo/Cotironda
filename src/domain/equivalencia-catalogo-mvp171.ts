/**
 * MVP171: equivalencias comerciales genericas para CUALQUIER rubro.
 *
 * El catalogo/categorias y atributos canonicos DEBEN ser corroborados
 * servidor-side contra ficha de proveedor y fuente SHA del presupuesto.
 * Un LLM puede proponer familias/atributos, nunca atestarlos.
 * No calcula dinero, IVA, flete, disponibilidad o ranking.
 */
export type AtributoComercialMvp171=Readonly<{
 clave:string;valor:string;
 obligatorio:boolean;
}>;
export type EntradaComercialMvp171=Readonly<{
 familiaPedido:string;familiaOferta:string;
 /** La familia puede venir de catalogo O del propio original corroborado. */
 familiaCatalogoAcreditada:boolean;
 familiaCotejadaEnTextoFuente?:boolean;
 fuenteProveedorAcreditada:boolean;
 unidadCanonicaPedido:string;unidadCanonicaOferta:string;
 cantidadCanonicaPedido:string;cantidadCanonicaOferta:string;
 conversionPresentacionAcreditada:boolean;
 atributosPedido:readonly AtributoComercialMvp171[];
 atributosOferta:readonly AtributoComercialMvp171[];
}>;
export type EstadoComercialMvp171=
 'no_acreditado'|'incompatible'|'compatible_exacto'|
 'alternativa_comercial_con_aclaracion';
export type ResultadoComercialMvp171=Readonly<{
 estado:EstadoComercialMvp171;
 motivos:readonly ('fuente_no_acreditada'|'familia_distinta'|
  'cantidad_insuficiente'|'unidad_sin_conversion'|
  'especificacion_contraria'|'exigencia_no_acreditada'|
  'variante_no_declarada'|'marca_alternativa')[];
 /** Solo aptitud COMERCIAL. Aun exige IVA, flete, stock y precio. */
 equivalenciaParaComparador:'verificada'|'comercial_razonable'|null;
 rankingHabilitado:false;contactosRevelados:false;
}>;
const NUM=/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/u;
const KEY=/^[a-z][a-z0-9_]{1,49}$/u;
const UNIT=/^(?:unit|bag|box|kg|g|l|ml|m|m2|m3|roll|pack)$/u;
/** Atributos físicos que no admiten suposición ni en ausencia de exigencia textual. */
const ESENCIALES=new Set(['tension_v','seccion_mm2','amperaje_a',
 'potencia_w','presion_bar','resistencia','norma_seguridad','diametro_mm']);
const text=(s:string)=>s.normalize('NFKC').toLocaleLowerCase('es-AR')
 .normalize('NFD').replace(/\p{M}/gu,'').replace(/\s+/gu,' ').trim();
const milli=(v:string):bigint|null=>{
 if(!NUM.test(v))return null;
 const [i,f='']=v.split('.');
 return BigInt(i)*1000n+BigInt(f.padEnd(3,'0')||'0');
};
function out(estado:EstadoComercialMvp171,
 motivos:ResultadoComercialMvp171['motivos']):ResultadoComercialMvp171{
 return Object.freeze({
  estado,motivos:Object.freeze([...new Set(motivos)]),
  equivalenciaParaComparador:estado==='compatible_exacto'
   ?'verificada':estado==='alternativa_comercial_con_aclaracion'
    ?'comercial_razonable':null,
  rankingHabilitado:false as const,contactosRevelados:false as const
 });
}
/**
 * No intenta "adivinar" el rubro desde similitud de palabras.
 * Equivalencia de marca NO implica equivalencia de medida/potencia/safety.
 */
export function evaluarEquivalenciaCatalogoMvp171(
 x:EntradaComercialMvp171
):ResultadoComercialMvp171{
 if(!x||(x.familiaCatalogoAcreditada!==true&&x.familiaCotejadaEnTextoFuente!==true)||
  x.fuenteProveedorAcreditada!==true||
  !Array.isArray(x.atributosPedido)||!Array.isArray(x.atributosOferta)||
  x.atributosPedido.length>30||x.atributosOferta.length>30||
  typeof x.familiaPedido!=='string'||typeof x.familiaOferta!=='string'||
  !KEY.test(x.familiaPedido)||!KEY.test(x.familiaOferta)||
  typeof x.unidadCanonicaPedido!=='string'||
  typeof x.unidadCanonicaOferta!=='string'||
  !UNIT.test(x.unidadCanonicaPedido)||!UNIT.test(x.unidadCanonicaOferta)||
  ![...x.atributosPedido,...x.atributosOferta].every(a=>
   a&&typeof a.clave==='string'&&KEY.test(a.clave)&&
   typeof a.valor==='string'&&a.valor.length>0&&a.valor.length<=100&&
   typeof a.obligatorio==='boolean')||
  new Set(x.atributosPedido.map(a=>a.clave)).size!==x.atributosPedido.length||
  new Set(x.atributosOferta.map(a=>a.clave)).size!==x.atributosOferta.length)
  return out('no_acreditado',['fuente_no_acreditada']);
 const asked=milli(x.cantidadCanonicaPedido),given=milli(x.cantidadCanonicaOferta);
 if(asked===null||given===null||asked===0n||given===0n)
  return out('no_acreditado',['fuente_no_acreditada']);
 if(x.familiaPedido!==x.familiaOferta)
  return out('incompatible',['familia_distinta']);
 if(x.unidadCanonicaPedido!==x.unidadCanonicaOferta||
  x.conversionPresentacionAcreditada!==true)
  return out('no_acreditado',['unidad_sin_conversion']);
 if(given<asked)return out('incompatible',['cantidad_insuficiente']);
 const source=new Map(x.atributosOferta.map(a=>[a.clave,a.valor]));
 let alternative=false;
 const reasons:('variante_no_declarada'|'marca_alternativa')[]=[];
 for(const attribute of x.atributosPedido){
  const offered=source.get(attribute.clave);
  if(offered===undefined){
   if(attribute.obligatorio||ESENCIALES.has(attribute.clave))
    return out('no_acreditado',['exigencia_no_acreditada']);
   alternative=true;reasons.push('variante_no_declarada');continue;
  }
  if(text(offered)!==text(attribute.valor)){
   if(attribute.obligatorio||attribute.clave!=='marca')
    return out('incompatible',['especificacion_contraria']);
   alternative=true;reasons.push('marca_alternativa');
  }
 }
 return alternative?out('alternativa_comercial_con_aclaracion',reasons):
  out('compatible_exacto',[]);
}
