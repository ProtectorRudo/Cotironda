/** Informe privado de SOLO estructura. Nunca expone originales, productos,
 * números, nombres, contactos, respuestas del modelo ni credenciales.
 * Se usa únicamente en un diagnóstico de lectura autenticado y sin SQL.
 */
import {numeroNaturalV2D013} from './evidencia-atributos-v2-d013.ts';
import {unidadCompradaCanonicaV2D013,
 unidadDimensionadaV2D013} from './magnitudes-universales-v2-d013.ts';

export type InformeCantidadPrivadaD013=Readonly<{
 indiceArticulo:number;indiceLinea:number;
 posicionTramo:'inicio_linea'|'tras_prefijo'|'mitad_linea';
 prefijoLinea:'vacio'|'con_numeros'|'sin_numeros';
 sufijoLinea:'vacio'|'con_numeros'|'sin_numeros';
 citaTipo:'vacia'|'numero_legible'|'numero_ilegible'|'texto_ilegible';
 citaDentroTramo:boolean;
 numeroModeloTipo:'entero'|'decimal'|'invalido';
 estructuraTramo:readonly string[];
 truncado:boolean;
}>;

const tokens=(s:string):string[]=>[
 ...s.normalize('NFD').replace(/[\u0300-\u036f]/gu,'')
 .matchAll(/\d[\d.,/]*|[\p{L}]+|[,;:()/]|[^\s]/gu)
].map(m=>m[0]);
const unidades=new Set(['bag','bigbag','bucket','roll','box','pack','unit']);
function mascara(token:string):string{
 if(/^\d+(?:[.,]\d+)?$/u.test(token))
  return /[.,]/u.test(token)?'numero_decimal':'numero_entero';
 if(/^\d[\d.,/]*$/u.test(token))return 'numero_confuso';
 if(/^[,;:()/]$/u.test(token))return 'separador';
 const fisica=unidadDimensionadaV2D013(token);
 if(fisica)return 'unidad_fisica_'+fisica.canonica.replace(/[^a-z0-9]/gu,'');
 const comercial=unidadCompradaCanonicaV2D013(token);
 if(unidades.has(comercial))return 'envase_'+comercial;
 if(numeroNaturalV2D013(token)!==null)return 'numero_en_palabras';
 return 'palabra_oculta';
}
export function resumirCantidadPrivadaD013(
 fuente:string,item:{inicio:number;fin:number;evidencia:string;
  citaCantidad:unknown;cantidad:unknown},indice:number
):InformeCantidadPrivadaD013|null{
 if(typeof fuente!=='string'||fuente.length>12000||
  !Number.isSafeInteger(indice)||indice<0||indice>199||
  !Number.isSafeInteger(item.inicio)||!Number.isSafeInteger(item.fin)||
  item.inicio<0||item.fin<=item.inicio||item.fin>fuente.length||
  typeof item.evidencia!=='string'||
  fuente.slice(item.inicio,item.fin)!==item.evidencia)return null;
 const inicioLinea=fuente.lastIndexOf('\n',item.inicio-1)+1;
 const siguiente=fuente.indexOf('\n',item.inicio);
 const finLinea=siguiente<0?fuente.length:siguiente;
 const prefijo=fuente.slice(inicioLinea,item.inicio).trim();
 const sufijo=fuente.slice(item.fin,finLinea).trim();
 const clase=(s:string)=>s.length===0?'vacio':
  /\d/u.test(s)?'con_numeros':'sin_numeros';
 const cita=typeof item.citaCantidad==='string'?item.citaCantidad:'';
 const parsed=numeroNaturalV2D013(cita);
 const cantidad=typeof item.cantidad==='string'?item.cantidad:'';
 const tipos=parsed!==null?'numero_legible':
  !cita.trim()?'vacia':/^\d[\d\s,./-]*$/u.test(cita.trim())
  ?'numero_ilegible':'texto_ilegible';
 const words=tokens(item.evidencia);
 return Object.freeze({
  indiceArticulo:indice,
  indiceLinea:Math.min(199,fuente.slice(0,inicioLinea).split('\n').length-1),
  posicionTramo:prefijo===''?'inicio_linea':sufijo===''?'tras_prefijo':'mitad_linea',
  prefijoLinea:clase(prefijo),sufijoLinea:clase(sufijo),
  citaTipo:tipos,citaDentroTramo:cita!==''&&item.evidencia.includes(cita),
  numeroModeloTipo:/^\d{1,6}$/u.test(cantidad)?'entero':
   /^(?:\d{1,6})\.\d{1,3}$/u.test(cantidad)?'decimal':'invalido',
  estructuraTramo:Object.freeze(words.slice(0,24).map(mascara)),
  truncado:words.length>24
 });
}
