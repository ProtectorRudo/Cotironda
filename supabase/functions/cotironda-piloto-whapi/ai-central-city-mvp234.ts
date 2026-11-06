/** MVP234: solo normaliza respuestas breves de localidad en IA Central.
 * No deduce una zona a partir de una compra, ni asocia mensajes con rondas.
 * La RPC MVP233 es quien verifica que haya UN pedido pendiente del remitente.
 */
import {standaloneDeliveryCity} from './core.ts';

const PREFIX= /^(?:la\s+entrega\s+(?:(?:es|ser[ií]a)\s+)?(?:en|para)\s+|la\s+obra\s+(?:queda|est[aá]|es)\s+en\s+|(?:es|ser[ií]a)\s+(?:en|para)\s+|(?:localidad|destino|zona(?:\s+de\s+entrega)?)\s*[:=-]\s*|(?:en|para)\s+)/iu;
const NOT_CITY=/\b(?:quiero|necesito|cotizar|presupuesto|cotizacion|precios?|cuanto|bolsas?|cemento|ladrillos?|tornillos?|pintura|ahora|mañana|despues|luego|confirmo|consulta|pregunta|gracias|hola|buenas|saludos|mensaje)\b/iu;

/** Respeta nombres libres (City Bell, La Plata, Villa Elisa, etc.);
 * no conserva el saludo, verbo o frase de entrega como parte de la ciudad.
 */
export function ciudadDeRespuestaCentralMvp234(raw:unknown):string|null{
 if(typeof raw!=='string'||raw.length<3||raw.length>130)return null;
 const body=raw.trim();
 if(!body||/[\n\r\u0000-\u001f]/u.test(body))return null;
 const candidate=body.replace(PREFIX,'').trim();
 if(candidate===body && /^(?:la\s+(?:entrega|obra)|(?:es|ser[ií]a|mejor)\s+(?:en|para))\b/iu.test(body))
  return null;
 // El validador común rechaza «buenos» como saludo, incluso dentro
 // del nombre geográfico «Buenos Aires». Comprobar la misma cadena con
 // esa única expresión neutralizada evita bloquear la localidad válida.
 const validated=standaloneDeliveryCity(
  candidate.replace(/\bBuenos\s+Aires\b/giu,'Baires'));
 if(!validated||NOT_CITY.test(candidate))return null;
 return candidate.replace(/[.]\s*$/u,'').trim();
}

/** Responder una localidad nunca permite abrir un nuevo pedido: ni cuando
 * no hay contexto, ni si ya se consumió una respuesta idéntica.
 */
export function estadoClaimZonaMvp234(raw:unknown):
 'resume'|'consumed'|'inconsistent'{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return 'inconsistent';
 const state=(raw as Record<string,unknown>).state;
 if(state==='resumed')return 'resume';
 if(state==='ambiguous'||state==='no_pending'||state==='already_consumed')
  return 'consumed';
 return 'inconsistent';
}
