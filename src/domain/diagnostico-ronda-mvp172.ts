/**
 * MVP172 — Previsualización PRIVADA de cobertura real (no endpoint de portal).
 * Junta la RPC respaldada por SQL con el puente MVP170/171 ya existente.
 * El resultado devuelto es deliberadamente una PROYECCIÓN ANÓNIMA, sin hash,
 * texto original, nombres, contactos, importes, archivo o adjudicación.
 *
 * Una alternativa comercial no equivale a disponibilidad de stock ni a una
 * comparación final con IVA/flete completos.
 */
import {prepararPresentacionesAridosMvp170} from './adaptador-documental-mvp162.ts';
import {cotejarPresentacionObraMvp174} from './cotejo-presentaciones-mvp174.ts';
import type {
 DocumentoFuente,HechosPresentacionMvp170,PedidoItemOriginalMvp170,
 MotivoPresentacionMvp170
} from './adaptador-documental-mvp162.ts';
import type {UnidadCotizada} from './comparacion-ofertas.ts';

const UNIDADES=new Set<UnidadCotizada>([
 'unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack'
]);
const ID=/^[a-z][a-z0-9_]{2,49}$/u;
const HASH=/^[0-9a-f]{64}$/u;
const DEC=/^(?:0|[1-9]\d{0,8})\.\d{3}$/u;

export type InsumoRondaPrivadoMvp172=Readonly<{
 state:'private_inputs';
 rankingAllowed:false;contactsRevealed:false;
 requestItems:readonly (PedidoItemOriginalMvp170&Readonly<{familia:string}>)[];
 quotations:readonly Readonly<{
  doc:DocumentoFuente;fuente:HechosPresentacionMvp170;
  economia:Readonly<{
   state:'source_checked';sourceSha256:string;rankingAllowed:false;
   descuentos:Readonly<{estado:string;precios:readonly unknown[]}>;
   condiciones:Readonly<{
    iva:Readonly<{estado:string}>;
    flete:Readonly<{estado:string}>;
    pago:Readonly<{estado:string}>;
    rankingHabilitado:false;stockCorroborado:false;
   }>;
  }>;
 }>[];
}>;
type EstadoPreview='alternativa_comercial_con_aclaracion'|
 'coincide_volumen_nominal_sin_stock'|
 'variedad_diferente'|'cantidad_diferente'|
 'variedad_no_acreditada'|'presentacion_ambigua'|
 'sin_presentacion_corroborada'|'presentacion_sin_acreditar'|'no_aplica';
export type ResultadoPreviewMvp172=Readonly<{
 estado:'insumos_invalidos'|'diagnostico_privado';
 rondaResumen:Readonly<{articulosSolicitados:number;cotizacionesTotales:number;
  cotizacionesAuditadas:number}>;
 proveedoresAnonimos:readonly Readonly<{
  oferta:string;precioTotalComparable:null;
  fiscalidad:'sin_base_comparable';
  flete:'no_acreditado_para_total';
  disponibilidad:'no_acreditada';
  articulos:readonly Readonly<{
   itemId:string;estado:EstadoPreview;lineaFuente:number|null;
  }>[];
 }>[];
 rankingHabilitado:false;adjudicacion:false;contactosRevelados:false;
 originalesDescargables:false;whatsappEnviado:false;
}>;
function result(
 estado:ResultadoPreviewMvp172['estado'],
 num:number,qs:ResultadoPreviewMvp172['proveedoresAnonimos']
):ResultadoPreviewMvp172{
 return Object.freeze({
  estado,rondaResumen:Object.freeze({
   articulosSolicitados:estado==='diagnostico_privado'?num:0,
   cotizacionesTotales:estado==='diagnostico_privado'?qs.length:0,
   cotizacionesAuditadas:estado==='diagnostico_privado'?qs.length:0
  }),
  proveedoresAnonimos:Object.freeze([...qs]),
  rankingHabilitado:false as const,adjudicacion:false as const,
  contactosRevelados:false as const,originalesDescargables:false as const,
  whatsappEnviado:false as const
 });
}
const invalid=()=>result('insumos_invalidos',0,[]);
const estados=new Set<EstadoPreview>([
 'no_aplica','sin_presentacion_corroborada','cantidad_diferente',
 'variedad_no_acreditada','variedad_diferente','presentacion_ambigua',
 'coincide_volumen_nominal_sin_stock','alternativa_comercial_con_aclaracion',
 'presentacion_sin_acreditar'
]);

export function diagnosticarRondaPrivadaMvp172(
 input:InsumoRondaPrivadoMvp172
):ResultadoPreviewMvp172{
 if(!input||input.state!=='private_inputs'||input.rankingAllowed!==false||
  input.contactsRevealed!==false||
  !Array.isArray(input.requestItems)||input.requestItems.length<1||
  input.requestItems.length>30||
  !Array.isArray(input.quotations)||input.quotations.length<1||
  input.quotations.length>12)return invalid();
 const ids=new Set<string>();
 for(const item of input.requestItems){
  if(!item||!ID.test(item.id)||ids.has(item.id)||
   !UNIDADES.has(item.unidad)||!DEC.test(item.cantidad)||
   typeof item.descripcionLiteral!=='string'||
   item.descripcionLiteral.trim().length===0||
   item.descripcionLiteral.length>500||
   typeof item.familia!=='string'||item.familia.length>80)
   return invalid();
  ids.add(item.id);
 }
 const outputs:ResultadoPreviewMvp172['proveedoresAnonimos'][number][]=[];
 const seen=new Set<string>();
 let sameRequest:string|null=null;
 for(let i=0;i<input.quotations.length;i++){
  const entry=input.quotations[i];
  if(!entry||!entry.doc||!entry.fuente||!entry.economia)return invalid();
  const {doc,fuente,economia}=entry;
  if(!HASH.test(doc.messageHmac)||!HASH.test(doc.sourceSha256)||
   seen.has(doc.messageHmac)||doc.anonId!=='anon_private'||
   !doc.requestId||sameRequest!==null&&doc.requestId!==sameRequest||
   economia.state!=='source_checked'||
   economia.rankingAllowed!==false||
   economia.sourceSha256!==doc.sourceSha256||
   !economia.descuentos||!Array.isArray(economia.descuentos.precios)||
   economia.descuentos.precios.length!==doc.lineas.length||
   !economia.condiciones||
   economia.condiciones.rankingHabilitado!==false||
   economia.condiciones.stockCorroborado!==false||
   !['no_informado','incluido','no_incluido','tasa_sin_base','contradictorio'].includes(economia.condiciones.iva?.estado)||
   !['no_informado','incluido','sin_cargo','adicional_con_importe','adicional_sin_importe','importe_sin_tratamiento','a_convenir','contradictorio'].includes(economia.condiciones.flete?.estado))
   return invalid();
  sameRequest=doc.requestId;
  seen.add(doc.messageHmac);
  const analysis=prepararPresentacionesAridosMvp170(
   input.requestItems,doc,fuente
  );
  // If even one source line is invalid, do not show a misleading partial
  // assessment as though its invoice had an approved v9 proof.
  if(analysis.estado!=='preparacion_offline'||
   !analysis.puente||analysis.puente.estado==='fuente_no_verificada'||
   analysis.diagnosticos.length!==input.requestItems.length||
   analysis.diagnosticos.some(x=>!ids.has(x.itemId)||!estados.has(x.estado)))
   return invalid();
  // Preserve all v9/SHA checks above. Additional rubros only refine no_aplica.
  const diagnostics=analysis.diagnosticos.map((line,index)=>{
   if(line.estado!=='no_aplica')return line;
   const extra=cotejarPresentacionObraMvp174(
    input.requestItems[index],doc.lineas,fuente.lines
   );
   return extra.estado==='no_aplica'?line:extra;
  });
  if(diagnostics.some((x,i)=>x.itemId!==analysis.diagnosticos[i].itemId||
   !estados.has(x.estado)))return invalid();
  outputs.push(Object.freeze({
   oferta:'oferta_'+String(i+1).padStart(3,'0'),
   precioTotalComparable:null as null,
   fiscalidad:'sin_base_comparable' as const,
   flete:'no_acreditado_para_total' as const,
   disponibilidad:'no_acreditada' as const,
   articulos:Object.freeze(diagnostics.map(x=>Object.freeze({
    itemId:x.itemId,estado:x.estado as EstadoPreview,lineaFuente:x.lineNo
   })))
  }));
 }
 return result('diagnostico_privado',input.requestItems.length,outputs);
}
