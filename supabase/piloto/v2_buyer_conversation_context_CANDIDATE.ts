/** Cotironda V2 — adaptador de conversación para la IA Central.
 * NO envía, NO crea fuentes sintéticas, NO reemplaza originales.
 * Solo texto por ahora; los adjuntos requieren su extractor autenticado.
 */
export type FuenteConversacionV2=Readonly<{
 message_hmac:string;source_sha256:string;kind:string;nonce:string;ciphertext:string;
}>;
export type TramoConversacionV2=Readonly<{
 messageHmac:string;sha256:string;inicio:number;fin:number;
}>;
export type ContextoConversacionV2=Readonly<{
 texto:string;tramos:readonly TramoConversacionV2[];
}>;
const HASH=/^[a-f0-9]{64}$/u;
export async function abrirConversacionTextoV2(args:{
 chatHmac:string;fuentes:readonly FuenteConversacionV2[];
 descifrar:(nonce:string,ciphertext:string,aad:string)=>Promise<string>;
 sha256:(text:string)=>Promise<string>;
}):Promise<ContextoConversacionV2>{
 if(!HASH.test(args.chatHmac)||!Array.isArray(args.fuentes)||!args.fuentes.length)
  throw Error('conversation_source_invalid');
 const seen=new Set<string>();const tramos:TramoConversacionV2[]=[];
 let texto='';
 for(const f of args.fuentes){
  if(!f||!HASH.test(f.message_hmac)||!HASH.test(f.source_sha256)||
    seen.has(f.message_hmac)||typeof f.nonce!=='string'||typeof f.ciphertext!=='string')
   throw Error('conversation_source_invalid');
  if(f.kind!=='text')throw Error('conversation_attachment_requires_verified_extractor');
  seen.add(f.message_hmac);
  const literal=await args.descifrar(f.nonce,f.ciphertext,
   args.chatHmac+'|'+f.message_hmac+'|text');
  if(typeof literal!=='string'||!literal.trim()||await args.sha256(literal)!==f.source_sha256)
   throw Error('conversation_source_sha_mismatch');
  if(texto)texto+='\n\n';
  const inicio=texto.length;texto+=literal;
  tramos.push({messageHmac:f.message_hmac,sha256:f.source_sha256,inicio,fin:texto.length});
 }
 return {texto,tramos:Object.freeze(tramos)};
}
/** Preserva la referencia a la fuente de cada cita; no atribuir un tramo
 * fabricado al mensaje original. La IA puede relacionar fragmentos, pero
 * las citas de producto/cantidad por separado deben conservar sus fuentes. */
export function evidenciaConversacionV2(contexto:ContextoConversacionV2,
 inicio:number,fin:number,evidencia:string):TramoConversacionV2|null{
 if(!Number.isSafeInteger(inicio)||!Number.isSafeInteger(fin)||inicio<0||fin<=inicio||
    contexto.texto.slice(inicio,fin)!==evidencia)return null;
 const t=contexto.tramos.find(x=>inicio>=x.inicio&&fin<=x.fin);
 return t?{...t,inicio:inicio-t.inicio,fin:fin-t.inicio}:null;
}
export type CondicionSolicitadaV2=Readonly<{
 valor:string;origen:'predeterminado'|'comprador';evidencia:TramoConversacionV2|null;
}>;
export type CitaCondicionV2=Readonly<{inicio:number;fin:number;literal:string}>;
const CONTACT=/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?\d[\s.-]?){9,}|\b(?:whatsapp|tel[eé]fono|celular|cuit|cuil|correo|email)\b)/iu;
/** La MISMA IA identifica las citas de pago/IVA en la lectura del comprador.
 * Ausencia explícita (null) activa cada default de forma independiente.
 * No usar esto para presupuestos del proveedor. Una cita inválida NO se
 * convierte en default: se devuelve error para autocorrección de IA. */
export function condicionesSolicitudV2(contexto:ContextoConversacionV2,
 pago:CitaCondicionV2|null,iva:CitaCondicionV2|null):
 Readonly<{pago:CondicionSolicitadaV2;iva:CondicionSolicitadaV2}>{
 const resolve=(c:CitaCondicionV2|null,valor:string):CondicionSolicitadaV2=>{
  if(c===null)return {valor,origen:'predeterminado',evidencia:null};
  if(!c||typeof c.literal!=='string'||c.literal.length>120||
     !c.literal.trim()||CONTACT.test(c.literal)||/[\u0000-\u001f\u007f]/u.test(c.literal))
   throw Error('conversation_condition_invalid');
  const evidencia=evidenciaConversacionV2(contexto,c.inicio,c.fin,c.literal);
  if(!evidencia)throw Error('conversation_condition_source_invalid');
  return {valor:c.literal.trim(),origen:'comprador',evidencia};
 };
 return {pago:resolve(pago,'Contado efectivo'),iva:resolve(iva,'Precios sin IVA')};
}
