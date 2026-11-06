/** MVP242 — Evidencia comercial determinista de IVA, flete y pago.
 * La IA interpreta lenguaje libre; esta guarda comprueba solamente que
 * la condición declarada esté efectivamente sustentada por la fuente.
 * NO calcula impuestos, precios de entrega, alícuotas ni términos nuevos.
 */
export type CampoCondicionMvp242='iva'|'flete'|'pago';
type EstadoCondicionMvp242=
 'incluido_explicito'|'sin_iva_explicito'|'excluido_explicito'|
 'a_convenir'|'contado'|'transferencia'|'credito'|'no_informado';

const normalizar=(v:string):string=>v.normalize('NFD')
 .replace(/[\u0300-\u036f]/gu,'').toLocaleLowerCase('es')
 .replace(/\s+/gu,' ').trim();

/** Pocas señales de CONDICIONES, no un catálogo de materiales ni una
 * traducción completa del español. Ausencia/contradicción => no certificar.
 */
const pautas:Readonly<Record<CampoCondicionMvp242,
 Readonly<Record<string,readonly RegExp[]>>>>={
 iva:{
  incluido_explicito:[
   /\biva\s*[:=]?\s*(?:(?:del?\s*)?\d{1,2}\s*%\s*)?incluid[oa]s?\b/u,
   /\bcon\s+(?:el\s+)?iva\b/u,
   /\bc\s*\/\s*iva\b/u,
   /\b(?:precios?|importes?)\s+(?:(?:finales?|todos?)\s+)?con\s+(?:el\s+)?iva\b/u
  ],
  sin_iva_explicito:[
   /\bsin\s+(?:el\s+)?iva\b/u,
   /(?:\+|\bmas\b)\s*(?:el\s+)?iva\b/u,
   /\biva\s*[:=]?\s*(?:no\s+incluid[oa]s?|aparte|excluid[oa]s?|adicional)\b/u,
   /\bno\s+incluy(?:e|en)\s+(?:el\s+)?iva\b/u
  ]
 },
 flete:{
  incluido_explicito:[
   /\b(?:flete|envio|entrega)\s*[:=]?\s+(?:ya\s+)?incluid[oa]s?\b/u,
   /\b(?:flete|envio|entrega)\s*[:=]?\s+(?:sin\s+cargo|gratis|bonificad[oa]s?)\b/u,
   /\bsin\s+cargo\s+(?:por\s+|de\s+)?(?:flete|envio|entrega)\b/u
  ],
  excluido_explicito:[
   /\bsin\s+(?:incluir\s+)?(?:flete|envio)\b/u,
   /\b(?:flete|envio)\s*[:=]?\s+(?:aparte|no\s+incluid[oa]s?|excluid[oa]s?)\b/u,
   /\bno\s+incluy(?:e|en)\s+(?:el\s+)?(?:flete|envio)\b/u,
   /\b(?:flete|envio)\s+a\s+cargo\s+del?\s+(?:comprador|cliente)\b/u
  ],
  a_convenir:[
   /\b(?:flete|envio)\s*[:=]?\s+(?:a\s+convenir|a\s+cotizar|a\s+confirmar|a\s+presupuestar|segun\s+(?:la\s+)?zona)\b/u,
   /\b(?:costo|precio)\s+(?:del?\s+)?(?:flete|envio)\s+(?:a\s+convenir|a\s+cotizar)\b/u
  ]
 },
 pago:{
  contado:[
   /\b(?:al?\s+)?contado\b/u,
   /\bpago\s+(?:en\s+)?efectivo\b/u,
   /\bforma\s+de\s+pago\s*:\s*efectivo\b/u
  ],
  transferencia:[
   /\btransferencia(?:\s+bancaria)?\b/u,
   /\bpago\s+(?:por|mediante|con)\s+(?:cbu|alias)\b/u
  ],
  credito:[
   /\b(?:a\s+credito|credito\s+comercial|cuenta\s+corriente)\b/u,
   /\b(?:pago|factura)\s+a\s+\d{1,3}\s+dias\b/u,
   /\bcredito\s+(?:a\s+)?\d{1,3}\s+dias\b/u
  ]
 }
};

/** Se acredita un ÚNICO estado por categoría, nunca una condición global
 * a partir de un documento contradictorio o con alternativas de pago.
 */
export function estadoFuenteCondicionMvp242(
 fuente:unknown,campo:CampoCondicionMvp242
):EstadoCondicionMvp242|'ambiguo'|null{
 if(typeof fuente!=='string'||fuente.length===0||fuente.length>150000||
  !Object.hasOwn(pautas,campo))return null;
 const source=normalizar(fuente);
 const hits=Object.entries(pautas[campo])
  .filter(([,patterns])=>patterns.some(p=>p.test(source)))
  .map(([estado])=>estado as EstadoCondicionMvp242);
 if(hits.length>1)return 'ambiguo';
 return hits[0]??'no_informado';
}

/** El lector de doble IA exige además una CITA EXACTA, que contenga
 * ella misma el fundamento de ese estado. "IVA", "entrega el lunes" o
 * "cemento" no pueden certificar una condición comercial.
 */
export function evidenciaCondicionMvp242(
 fuente:unknown,campo:CampoCondicionMvp242,
 valor:unknown,cita:unknown
):boolean{
 if(typeof fuente!=='string'||typeof valor!=='string')return false;
 const encontrado=estadoFuenteCondicionMvp242(fuente,campo);
 if(encontrado===null||encontrado==='ambiguo'||valor!==encontrado)
  return false;
 if(valor==='no_informado')return cita===null;
 if(typeof cita!=='string'||cita.length<3||cita.length>240||
   !fuente.includes(cita))return false;
 return estadoFuenteCondicionMvp242(cita,campo)===valor;
}

/** El comparador tipado no lleva citas individuales: rechazar la
 * condición si la fuente no acredita exactamente el mismo estado.
 */
export function condicionFuenteMvp242(
 fuente:unknown,campo:CampoCondicionMvp242,valor:unknown
):boolean{
 if(typeof valor!=='string')return false;
 return estadoFuenteCondicionMvp242(fuente,campo)===valor;
}
