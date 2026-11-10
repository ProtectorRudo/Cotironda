/** Etapa 2 MVP238. Solo detecta un aviso humano de archivo que llegará después.
 * No identifica una ronda, no interpreta precios y no concede permisos.
 */
const FOLD=(text:string)=>text.normalize('NFD')
 .replace(/[\u0300-\u036f]/gu,'').toLocaleLowerCase('es').trim();
const ACTION=/(?:^|[\s,;:])(?:te\s+(?:paso|mando|envio|adjunto|comparto|dejo)|(?:lo\s+)?adjunto|envio|mando|ahi\s+(?:te\s+)?(?:va|mando)|va\s+(?:el|la)|te\s+lo\s+paso)(?:\b|$)/iu;
const FILE=/\b(?:presupuesto|cotizacion|planilla|pdf|excel|archivo|documento|cotizaci[oó]n)\b/iu;
const COMMERCIAL=/\b(?:precio|unitario|total|descuento|iva|flete|bolsas?|kilos?|metros?|unidades?|cemento|arena|pintura|ladrillos?|tornillos?)\b/iu;

/** Un aviso NO equivale a una cotización. Con ruido, cifras o condiciones,
 * preferimos el flujo de cotización normal y una posible revisión.
 */
export function esAvisoAdjuntoProveedorMvp238(raw:unknown):boolean{
 if(typeof raw!=='string'||raw.length<7||raw.length>150)return false;
 if(/[\r\n\u0000-\u001f$€\d]/u.test(raw))return false;
 const s=FOLD(raw);
 if(s.length<7||s.length>145||
   /\b(?:no|nunca|todavia|despues|manana|luego|mas tarde)\b/u.test(s)||
   COMMERCIAL.test(s))return false;
 return ACTION.test(s)&&FILE.test(s);
}
