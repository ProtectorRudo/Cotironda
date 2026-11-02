/**
 * MVP-078 / primera fase — desglose auditable POR RENGLÓN del presupuesto
 * textual recibido de un proveedor autenticado.
 *
 * Nunca altera el original (MVP063); sólo agrega anotaciones con evidencia
 * monetaria de MVP075 y una referencia exacta al número de renglón.
 * Únicamente para backend privado. NO es una vista para compradores.
 * Clasificación humana/IA NO prueba equivalencia, IVA, flete ni cobertura.
 * No persiste, no calcula ranking, no publica contactos ni envía Whapi.
 */
import {auditarCotizacionTextoMvp075} from './auditoria-cotizacion-texto-mvp075.ts';

export type DestinoRenglonMvp078 =
 'solicitado'|'extra'|'cargo'|'descuento'|'aclaracion';
export type CorrelacionRenglonMvp078 = Readonly<{
 numeroLinea:number;
 destino:DestinoRenglonMvp078;
 articuloId:string|null;
}>;
export type EntradaLedgerMvp078 = Readonly<{
 textoOriginal:string;
 fuenteSha256:string;
 revision:number;
 correlaciones:readonly CorrelacionRenglonMvp078[];
}>;
export type LineaLedgerMvp078 = Readonly<{
 numeroLinea:number;
 textoExacto:string;
 tipoDetectado:string;
 importesLiterales:readonly string[];
 destino:DestinoRenglonMvp078|'sin_clasificar';
 articuloId:string|null;
 importeObservado:string|null;
 importeVerificado:boolean;
}>;
export type LedgerMvp078 = Readonly<{
 estado:'desglose_privado_sin_ranking';
 revision:number;
 fuenteSha256:string;
 fuenteOriginal:string;
 lineas:readonly LineaLedgerMvp078[];
 totalDeclaradoLiteral:string|null;
 totalDecimalVerificado:string|null;
 estadoTotal:string;
 estadoConciliacion:string;
 estadoIva:string;
 estadoFlete:string;
 lineasSinClasificarConImportes:number;
 lineasSolicitadasConImportesVerificados:number;
 lineasSolicitadasSinImporteVerificado:number;
 presupuestoOriginalIntacto:true;
 equivalenciasVerificadas:false;
 comparacionHabilitada:false;
 revelacionContactos:false;
 enviosWhatsapp:0;
}>;
const ARTICULO=/^[a-z][a-z0-9_]{2,49}$/u;
const SHA=/^[a-f0-9]{64}$/u;
const DESTINOS=new Set<DestinoRenglonMvp078>(
 ['solicitado','extra','cargo','descuento','aclaracion']);
function fail():never{throw new TypeError('mvp078_vinculo_fuente_invalido')}
function exactKeys(o:unknown,keys:readonly string[]):o is Record<string,unknown>{
 return o!==null&&typeof o==='object'&&!Array.isArray(o)&&
  Object.keys(o).length===keys.length&&
  Object.keys(o).every(k=>keys.includes(k));
}
/**
 * La llamada debe proceder de un lector autenticado, que descifra la versión
 * original y suministra su SHA-256. Nunca pasar datos del comprador directamente.
 */
export function vincularRenglonesOriginalesMvp078(input:EntradaLedgerMvp078):LedgerMvp078{
 if(!exactKeys(input,['textoOriginal','fuenteSha256','revision','correlaciones'])||
  typeof input.textoOriginal!=='string'||
  typeof input.fuenteSha256!=='string'||!SHA.test(input.fuenteSha256)||
  !Number.isSafeInteger(input.revision)||input.revision<1||input.revision>100||
  !Array.isArray(input.correlaciones)||input.correlaciones.length>350)fail();
 const audit=auditarCotizacionTextoMvp075(input.textoOriginal);
 if(audit.sha256!==input.fuenteSha256)fail();
 const seen=new Set<number>();
 const mapped=new Map<number,CorrelacionRenglonMvp078>();
 for(const c of input.correlaciones){
  if(!exactKeys(c,['numeroLinea','destino','articuloId'])||
   !Number.isSafeInteger(c.numeroLinea)||c.numeroLinea<1||
   c.numeroLinea>audit.lineas.length||seen.has(c.numeroLinea)||
   typeof c.destino!=='string'||!DESTINOS.has(c.destino as DestinoRenglonMvp078))fail();
  if(c.destino==='solicitado'){
   if(typeof c.articuloId!=='string'||!ARTICULO.test(c.articuloId))fail();
  }else if(c.articuloId!==null)fail();
  const line=audit.lineas[c.numeroLinea-1];
  // La anotación sólo puede etiquetar una clase compatible con la fuente.
  // No convertir impuestos, flete ni pallets en materiales solicitados.
  if(c.destino==='solicitado'&&
     (line.tipo!=='concepto'||line.importesLiterales.length===0))fail();
  if(c.destino==='extra'&&!['concepto','embalaje'].includes(line.tipo))fail();
  if(c.destino==='cargo'&&!['embalaje','flete','impuesto'].includes(line.tipo))fail();
  if(c.destino==='descuento'&&line.tipo!=='descuento')fail();
  if(c.destino==='aclaracion'&&
    (line.tipo!=='nota'||line.importesLiterales.length!==0))fail();
  seen.add(c.numeroLinea);mapped.set(c.numeroLinea,c);
 }
 const lines:LineaLedgerMvp078[]=audit.lineas.map(l=>{
  const c=mapped.get(l.numero);
  return Object.freeze({
   numeroLinea:l.numero,textoExacto:l.textoExacto,tipoDetectado:l.tipo,
   importesLiterales:Object.freeze([...l.importesLiterales]),
   destino:c?.destino??'sin_clasificar',
   articuloId:c?.articuloId??null,
   importeObservado:l.importeVerificable,
   importeVerificado:l.importeVerificable!==null
  });
 });
 // Es un desglose de la fuente completa, no una extracción parcial.
 // Incluso un precio no interpretado se conserva en su renglón original.
 const sinClasificar=lines.filter(l=>l.destino==='sin_clasificar'&&
   l.importesLiterales.length>0&&l.tipo!=='total'&&l.tipo!=='subtotal').length;
 const requested=lines.filter(l=>l.destino==='solicitado');
 return Object.freeze({
  estado:'desglose_privado_sin_ranking',
  revision:input.revision,fuenteSha256:audit.sha256,
  fuenteOriginal:audit.fuenteOriginal,lineas:Object.freeze(lines),
  totalDeclaradoLiteral:audit.totalDeclaradoLiteral,
  totalDecimalVerificado:audit.totalDecimalVerificado,
  estadoTotal:audit.estadoTotal,
  estadoConciliacion:audit.estadoConciliacion,
  estadoIva:audit.estadoIva,estadoFlete:audit.estadoFlete,
  lineasSinClasificarConImportes:sinClasificar,
  lineasSolicitadasConImportesVerificados:requested.filter(
    l=>l.importeVerificado).length,
  lineasSolicitadasSinImporteVerificado:requested.filter(
    l=>!l.importeVerificado).length,
  presupuestoOriginalIntacto:true as const,
  equivalenciasVerificadas:false as const,
  comparacionHabilitada:false as const,
  revelacionContactos:false as const,
  enviosWhatsapp:0 as const
 });
}
