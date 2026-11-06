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
 const city=standaloneDeliveryCity(candidate);
 if(!city||NOT_CITY.test(city))return null;
 return city;
}
