/**
 * MVP327 — OFFLINE, INTERNAL-ONLY review of an already received TEXT quote.
 *
 * A separate, authorized service must obtain the immutable source, newest
 * message pointer, buyer's request and their verified DB associations.
 * This function cannot authenticate a user, authorize a round, decrypt a
 * message, create a supplier quote or promote a review to "verified".
 *
 * The only successful outcome is a CANDIDATE for independent source audit.
 * It is NEVER a buyer-facing preview or a publish/approve instruction.
 * No OpenAI, network calls, pricing guesses, WhatsApp or state mutations.
 */
import {
 evaluarCotizacionMvp225,dineroCentavosLiteral,
 type PedidoLineaMvp225,type OfertaVerificadaMvp225
} from './calificador-cotizaciones-mvp225.ts';

export type InstantaneaInternaMvp327=Readonly<{
 requestId:string;
 mensajeHmac:string;
 mensajeMasRecienteHmac:string;
 fuenteSha256:string;
 fuenteMasRecienteSha256:string;
 estadoRevision:'review';
 finalizadaEn:string;
 formato:'text';
 textoOriginal:string;
}>;
export type PropuestaInternaMvp327=Readonly<{
 requestId:string;
 pedido:readonly PedidoLineaMvp225[];
 oferta:OfertaVerificadaMvp225;
}>;
export type EstadoConciliacionMvp327=
 'requiere_evidencia'|'candidato_para_auditoria_independiente';
export type ConciliacionInternaMvp327=Readonly<{
 state:EstadoConciliacionMvp327;
 motivos:readonly string[];
 articulosCotejados:number;
 renglonesSinAsignar:number;
 /** The following values must remain in an internal operator workspace. */
 sumatoriaMaterialesCentavos:string|null;
 moneda:'ARS'|'USD'|null;
 totalDeclaradoConciliado:boolean;
 necesitaAprobacionHumana:true;
 permitirPublicacion:false;
 actualizarRevisionAnterior:false;
 automatico:false;
 llamadasModelo:0;
 whatsappEnviados:0;
}>;

const HASH=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SOURCE_LIMIT=150000;
const BASE={
 necesitaAprobacionHumana:true as const,
 permitirPublicacion:false as const,
 actualizarRevisionAnterior:false as const,
 automatico:false as const,
 llamadasModelo:0 as const,
 whatsappEnviados:0 as const
};
function denied(reason:string):ConciliacionInternaMvp327{
 return Object.freeze({
  state:'requiere_evidencia',
  motivos:Object.freeze([reason]),
  articulosCotejados:0,renglonesSinAsignar:0,
  sumatoriaMaterialesCentavos:null,moneda:null,
  totalDeclaradoConciliado:false,...BASE
 });
}
function validText(s:unknown,max:number):s is string{
 return typeof s==='string'&&s.length>0&&s.length<=max&&
 !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(s);
}
async function sha256Utf8(s:string):Promise<string|null>{
 try{
  const bytes=new TextEncoder().encode(s);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
 }catch{return null}
}
const TOTAL=/^(?:(?:total(?:\s+(?:general|final|a\s+pagar|presupuesto|cotizaci[oó]n))?)|(?:importe|monto)\s+total)\s*[:=]?\s*((?:(?:AR\$|US\$|U\$S|\$)\s*|(?:ARS|USD)\s+)[0-9][0-9.,]*)\s*$/iu;
const SUMMARY_LABEL=/^(?:total(?:\s+(?:general|final|a\s+pagar|presupuesto|cotizaci[oó]n))?|subtotal|importe\s+total|monto\s+total)\b/iu;
function totalDeclarado(fuente:string):{found:false}|{found:true;centavos:bigint|null}{
 const lines=fuente.split(/\r?\n/u).map(x=>x.trim())
  .filter(x=>SUMMARY_LABEL.test(x));
 if(lines.length===0)return {found:false};
 if(lines.length!==1)return {found:true,centavos:null};
 const hit=lines[0].match(TOTAL);
 return {found:true,centavos:hit?dineroCentavosLiteral(hit[1]):null};
}

/** No hidden write path. No 'verified' state is ever returned. */
export async function cotejarOriginalTextualMvp327(
 snapshot:InstantaneaInternaMvp327,
 proposal:PropuestaInternaMvp327
):Promise<ConciliacionInternaMvp327>{
 if(!snapshot||!proposal||!UUID.test(snapshot.requestId)||
  snapshot.requestId!==proposal.requestId||
  snapshot.formato!=='text'||
  snapshot.estadoRevision!=='review'||
  !validText(snapshot.finalizadaEn,40)||
  !Number.isFinite(Date.parse(snapshot.finalizadaEn))||
  !HASH.test(snapshot.mensajeHmac)||
  !HASH.test(snapshot.mensajeMasRecienteHmac)||
  !HASH.test(snapshot.fuenteSha256)||
  !HASH.test(snapshot.fuenteMasRecienteSha256))
   return denied('vinculacion_no_acreditada');
 if(snapshot.mensajeHmac!==snapshot.mensajeMasRecienteHmac||
    snapshot.fuenteSha256!==snapshot.fuenteMasRecienteSha256)
   return denied('respuesta_superada_por_otra_version');
 if(!validText(snapshot.textoOriginal,SOURCE_LIMIT)||
    !proposal.oferta||proposal.oferta.fuente!==snapshot.textoOriginal)
   return denied('texto_original_no_coincide');
 // A message's original SHA is the SHA-256 of the exact UTF-8 bytes, not
 // normalized whitespace, a model paraphrase or an extracted PDF string.
 const digest=await sha256Utf8(snapshot.textoOriginal);
 if(!digest||digest!==snapshot.fuenteSha256)
   return denied('hash_del_original_no_coincide');

 // The existing deterministic economic guard validates every quoted
 // line against the exact source, unit/quantity, declared conditions,
 // money literals and any omitted monetary evidence.
 let review:ReturnType<typeof evaluarCotizacionMvp225>;
 try{
  review=evaluarCotizacionMvp225(proposal.pedido,proposal.oferta);
 }catch{return denied('datos_de_propuesta_invalidos')}
 const reasons=[...review.motivos];
 // A source may contain unpriced but commercially relevant products.
 // Matching only monetary literals is insufficient: every substantive
 // original line must appear verbatim in the proposed quoted lines.
 // Totals are checked independently below; a currency-only header isn't
 // an article. Unknown explanatory lines must not silently disappear.
 const sourceLines=snapshot.textoOriginal.split(/\r?\n/u).map(x=>x.trim())
  .filter(x=>x.length>0&&!SUMMARY_LABEL.test(x)&&
   !/^(?:ARS|USD)$/iu.test(x));
 // Inventory is a MULTISET, not a Set. Two identical unpriced source
 // lines must be cited twice; a single quotation cannot hide duplicates.
 const quoted=Array.isArray(proposal.oferta.lineas)?
  proposal.oferta.lineas.flatMap(line=>
   typeof line?.textoOriginal==='string'?
    line.textoOriginal.split(/\r?\n/u).map(s=>s.trim()):[]):[];
 const inventory=new Map<string,number>();
 for(const line of quoted)inventory.set(line,(inventory.get(line)??0)+1);
 let omitted=false;
 for(const line of sourceLines){
  const count=inventory.get(line)??0;
  if(count<=0){omitted=true;break}
  inventory.set(line,count-1);
 }
 if(omitted)reasons.push('lineas_de_fuente_sin_representacion');
 if(review.extras.length>0)reasons.push('renglones_adicionales_o_no_asignados');
 if(review.precios.length===0)reasons.push('sin_importes_cotejados');
 if(proposal.oferta.moneda!=='ARS'&&proposal.oferta.moneda!=='USD')
  reasons.push('moneda_sin_base_suficiente');

 const total=review.precios.reduce((acc,line)=>acc+line.centavos,0n);
 const explicit=totalDeclarado(snapshot.textoOriginal);
 if(explicit.found&&explicit.centavos!==total)
  reasons.push('total_declarado_no_conciliado');
 if(review.estado!=='verificada_para_comparacion'&&reasons.length===0)
  reasons.push('comparacion_no_acreditada');
 const unique=[...new Set(reasons)];
 const candidate=unique.length===0;
 return Object.freeze({
  state:candidate?'candidato_para_auditoria_independiente':'requiere_evidencia',
  motivos:Object.freeze(unique),
  articulosCotejados:review.precios.length,
  renglonesSinAsignar:review.extras.length,
  sumatoriaMaterialesCentavos:candidate?total.toString():null,
  moneda:candidate?proposal.oferta.moneda as 'ARS'|'USD':null,
  totalDeclaradoConciliado:candidate&&explicit.found,
  ...BASE
 });
}
