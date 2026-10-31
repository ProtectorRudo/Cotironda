/**
 * MVP-006: evidence-backed reading of commercial notes (OFFLINE).
 * AI may propose a quote + location; it NEVER proves tax or freight status.
 * Only exact source text + a conservatively recognized explicit statement
 * creates a declared fact. Empty/ambiguous evidence stays unknown.
 */
export type EstadoIva='incluido'|'no_incluido'|'no_informado'|'contradictorio';
export type EstadoFlete='incluido'|'sin_cargo'|'adicional'|'a_convenir'|'no_informado'|'contradictorio';
export type CondicionDocumental<T extends string>=Readonly<{
 estado:T;
 etiqueta:string;
 evidencias:readonly Readonly<{linea:number;cita:string}>[];
}>;
export type CondicionesPresupuesto=Readonly<{
 iva:CondicionDocumental<EstadoIva>;
 flete:CondicionDocumental<EstadoFlete>;
 estado:'lectura_local_sin_confirmacion_proveedor';
 precioFinalComparable:false;
}>;
const normal=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/\s+/gu,' ').trim();
function fuente(texto:unknown):string[]{
 if(typeof texto!=='string'||texto.length>18000||
   /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(texto))throw new TypeError('aclaraciones_invalidas');
 const lines=texto.split(/\r\n|\n|\r/u);
 if(lines.length>160)throw new TypeError('demasiadas_aclaraciones');
 return lines;
}
const negated=/\b(?:consultar|preguntar|confirmar|consultanos|verificar|duda|dudas|incierto|a definir|no se sabe|no se especifica|sin aclarar|no aclarado|no informado|por definir)\b/u;
const uncertainty=/\b(?:si incluye|si esta incluido|si esta incluido|puede incluir|podria incluir|tal vez|quizas|pendiente de confirmar)\b/u;
function estadoLineaIva(original:string):'incluido'|'no_incluido'|null{
 const s=normal(original);
 if(/[¿?]/u.test(original)||!/\biva\b/u.test(s)||negated.test(s)||uncertainty.test(s))return null;
 const excl=/(?:\b(?:sin|no incluye|no incluido|no se incluye|excluye|excluido|mas|adicional)\s+(?:el\s+)?iva\b|\biva\s+(?:no incluido|no se incluye|excluido|aparte|adicional)\b)/u;
 const incl=/(?:\biva\s+(?:incluido|incluida|incl\.)\b|\b(?:incluye|incluyen|incluido|incluida|con)\s+(?:el\s+)?iva\b|\bprecio(?:s)?\s+(?:final(?:es)?\s+)?(?:con|c\/)\s*iva\b)/u;
 const sinNegacionDuplicada=s.replace(/\bno\s+(?:incluye|incluyen|incluido|incluida)\s+(?:el\s+)?iva\b/gu,'');
 const hasExcl=excl.test(s),hasIncl=incl.test(sinNegacionDuplicada);
 return hasExcl===hasIncl?null:hasExcl?'no_incluido':'incluido';
}
function estadoLineaFlete(original:string):'incluido'|'sin_cargo'|'adicional'|'a_convenir'|null{
 const s=normal(original);
 if(/[¿?]/u.test(original)||!/\b(?:flete|envio|entrega|transporte)\b/u.test(s))return null;
 if(uncertainty.test(s)||/\b(?:no se sabe|sin aclarar|no aclarado|no informado|por definir)\b/u.test(s))return null;
 if(/\b(?:a convenir|a cotizar|a confirmar|consultar|consultanos|sujeto a cotizacion)\b/u.test(s))return 'a_convenir';
 const free=/(?:\b(?:flete|envio|transporte|entrega)\s+(?:sin cargo|gratis|gratuito|gratuita)\b|\b(?:sin cargo|gratis|gratuito|gratuita)\s+(?:el\s+)?(?:flete|envio|transporte|entrega)\b|\b(?:flete|envio)\s*:\s*(?:\$|ars\s*)?0(?:[.,]00)?\b)/u;
 const excl=/(?:\b(?:flete|envio|transporte)\s+(?:aparte|adicional|no incluido|excluido|a cargo del comprador)\b|\b(?:sin|no incluye|no incluido|excluye)\s+(?:el\s+)?(?:flete|envio|transporte)\b)/u;
 const incl=/(?:\b(?:flete|envio|transporte)\s+(?:incluido|incluida)\b|\b(?:incluye|incluyen|incluido|incluida|con)\s+(?:el\s+)?(?:flete|envio|transporte)\b)/u;
 const sinNegacionDuplicada=s.replace(/\bno\s+(?:incluye|incluyen|incluido|incluida)\s+(?:el\s+)?(?:flete|envio|transporte)\b/gu,'');
 const matches=[free.test(s),excl.test(s),incl.test(sinNegacionDuplicada)];
 if(matches.filter(Boolean).length!==1)return null;
 return matches[0]?'sin_cargo':matches[1]?'adicional':'incluido';
}
const IVA_LABEL:Readonly<Record<EstadoIva,string>>={
 incluido:'IVA incluido según aclaración encontrada (pendiente de confirmación del proveedor).',
 no_incluido:'IVA no incluido según aclaración encontrada (pendiente de confirmación del proveedor).',
 no_informado:'IVA no informado: el importe mostrado no acredita su inclusión ni exclusión.',
 contradictorio:'IVA: aclaraciones contradictorias. Se necesita confirmación.'
};
const FLETE_LABEL:Readonly<Record<EstadoFlete,string>>={
 incluido:'Flete incluido según aclaración encontrada (pendiente de confirmación del proveedor).',
 sin_cargo:'Flete sin cargo según aclaración encontrada (pendiente de confirmación del proveedor).',
 adicional:'Flete adicional según aclaración encontrada (pendiente de confirmación del proveedor).',
 a_convenir:'Flete a convenir o cotizar: importe no definido.',
 no_informado:'Flete no informado: el importe mostrado no acredita entrega incluida ni gratuita.',
 contradictorio:'Flete: aclaraciones contradictorias. Se necesita confirmación.'
};
function construir<T extends string>(items:readonly Readonly<{estado:T;linea:number;cita:string}>[],
  unknown:T,conflict:T,labels:Readonly<Record<T,string>>):CondicionDocumental<T>{
 const present=[...new Set(items.map(x=>x.estado))];
 const estado=present.length===0?unknown:present.length===1?present[0]:conflict;
 return Object.freeze({estado,etiqueta:labels[estado],
  evidencias:Object.freeze(items.map(({linea,cita})=>Object.freeze({linea,cita})))});
}
/**
 * Original line numbers and exact excerpts survive; no price or rate is
 * synthesized. This is a helper/validator, not live OpenAI extraction.
 */
export function leerCondicionesPresupuesto(texto:string):CondicionesPresupuesto{
 const iva:Readonly<{estado:EstadoIva;linea:number;cita:string}>[]=[];
 const flete:Readonly<{estado:EstadoFlete;linea:number;cita:string}>[]=[];
 const lines=fuente(texto);
 for(let i=0;i<lines.length;i++){
  const cita=lines[i].trim();
  // Notes, not arbitrarily long / injected prose; overly long lines are not evidence.
  if(!cita||cita.length>320)continue;
  const iv=estadoLineaIva(cita);
  const fl=estadoLineaFlete(cita);
  if(iv)iva.push({estado:iv,linea:i+1,cita});
  if(fl)flete.push({estado:fl,linea:i+1,cita});
 }
 return Object.freeze({
  iva:construir(iva,'no_informado','contradictorio',IVA_LABEL),
  flete:construir(flete,'no_informado','contradictorio',FLETE_LABEL),
  estado:'lectura_local_sin_confirmacion_proveedor',
  precioFinalComparable:false
 });
}
export type PropuestaEvidenciaIA=Readonly<{
 linea:number;
 cita:string;
 clase:'iva'|'flete';
 estadoPropuesto:EstadoIva|EstadoFlete;
}>;
/**
 * Do not trust a claimed state merely because it came from a model. Require
 * an exact citation at the declared position, and reclassify the quote with
 * deterministic guards. The trusted result is ONLY the validated evidence,
 * never a confirmed tax calculation.
 */
export function validarEvidenciaIA(texto:string,propuesta:PropuestaEvidenciaIA):
 Readonly<{valida:boolean;estadoVerificado:EstadoIva|EstadoFlete|null}>{
 const lines=fuente(texto);
 if(!Number.isSafeInteger(propuesta?.linea)||propuesta.linea<1||
   propuesta.linea>lines.length||typeof propuesta.cita!=='string'||
   propuesta.cita.trim().length<5||propuesta.cita.length>320||
   !['iva','flete'].includes(propuesta.clase))return{valida:false,estadoVerificado:null};
 const line=lines[propuesta.linea-1].trim();
 if(!line.includes(propuesta.cita)||line.length>320)return{valida:false,estadoVerificado:null};
 const state=propuesta.clase==='iva'?estadoLineaIva(line):estadoLineaFlete(line);
 return{valida:state!==null&&state===propuesta.estadoPropuesto,
  estadoVerificado:state};
}
