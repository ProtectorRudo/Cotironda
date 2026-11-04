/**
 * MVP167 — evidencia categórica de términos comerciales desde filas fuente.
 * Sin inferir tasa de IVA, precio neto, flete gratis ni forma de pago.
 * Es un auditor puro: NO crea TerminosAuditados ni habilita ranking.
 * El llamador privado debe comprobar el SHA de BYTES y extraer esas mismas filas.
 */
import {centavosFuenteMvp162,type DocumentoFuente} from './adaptador-documental-mvp162.ts';
import type {FilaOriginalMvp166} from './auditoria-descuentos-mvp166.ts';
export type UbicacionMvp167=Readonly<{pagina:number;fila:number}>;
export type EstadoIvaMvp167='no_informado'|'incluido'|'no_incluido'|'tasa_sin_base'|'contradictorio';
export type EstadoFleteMvp167='no_informado'|'incluido'|'sin_cargo'|
 'adicional_con_importe'|'adicional_sin_importe'|'importe_sin_tratamiento'|
 'a_convenir'|'contradictorio';
export type EstadoPagoMvp167='no_informado'|'contado'|'transferencia'|'cuenta_corriente_30_dias'|'multiple';
type Dato<T extends string>=Readonly<{estado:T;ubicaciones:readonly UbicacionMvp167[]}>;
export type ResultadoCondicionesMvp167=Readonly<{
 estado:'fuente_no_acreditada'|'fuente_leida';
 iva:Dato<EstadoIvaMvp167>&Readonly<{tasa:'0'|'10.5'|'21'|null}>;
 flete:Dato<EstadoFleteMvp167>&Readonly<{importe:string|null}>;
 pago:Dato<EstadoPagoMvp167>;
 netoSinIvaAcreditado:false;stockCorroborado:false;plazoCorroborado:false;
 minimoCompraCorroborado:false;rankingHabilitado:false;
 originalesModificados:false;contactosRevelados:false;
}>;
const HASH=/^[a-f0-9]{64}$/u;
const clean=(s:string)=>s.normalize('NFKC').toLocaleLowerCase('es-AR')
 .normalize('NFD').replace(/\p{M}/gu,'').replace(/\s+/gu,' ').trim();
const uncertain=/(?:[¿?]|\b(?:consultar|confirmar|preguntar|pendiente|sujeto a|a definir|por definir|no se (?:indica|informa|sabe|aclara)|sin aclarar|podria|quizas|tal vez|si incluye|si se incluye)\b)/iu;
const ivaToken=/\biva\b/u;
const ivaRate=/\biva\s*(?:al\s*)?(21|10[.,]5|0)\s*%|\b(21|10[.,]5|0)\s*%\s*(?:de\s*)?iva\b/gu;
const priceRe=/((?:ar\s*\$|\$)\s*(?:0|[1-9]\d{0,2}(?:\.\d{3})*|[1-9]\d{0,8})(?:,\d{1,2})?)/iu;
const normAmount=(literal:string):string|null=>{
 const c=centavosFuenteMvp162(literal.replace(/^ar\s*\$/iu,'$'));
 return c===null?null:String(c/100n)+'.'+String(c%100n).padStart(2,'0');
};
function iv(note:string):{estado:Exclude<EstadoIvaMvp167,'no_informado'|'contradictorio'>;tasa:'0'|'10.5'|'21'|null}|null{
 const s=clean(note);
 if(!ivaToken.test(s)||uncertain.test(note))return null;
 const incl=/(?:\biva\s+(?:incluido|incluida|incl\.)\b|\b(?:precio|total|importe|precios)\s+(?:final(?:es)?\s+)?(?:con|incluye)\s+iva\b|\biva\s*(?:al\s*)?(?:21|10[.,]5|0)\s*%\s*incluido\b)/u.test(s);
 const excl=/(?:\b(?:sin|mas|no incluye|no incluido|no se incluye)\s+(?:el\s+)?iva\b|\biva\s+(?:no\s+incluido|excluido|aparte|adicional)\b|\biva\s*(?:al\s*)?(?:21|10[.,]5|0)\s*%\s*(?:aparte|no incluido)\b)/u.test(s);
 const all=[...s.matchAll(ivaRate)].map(m=>(m[1]??m[2]).replace(',','.'));
 const unique=[...new Set(all)];
 if(unique.length>1||incl&&excl)return null;
 const tasa=unique.length===1?unique[0] as '0'|'10.5'|'21':null;
 if(!incl&&!excl&&tasa===null)return null;
 return {estado:incl?'incluido':excl?'no_incluido':'tasa_sin_base',tasa};
}
function fr(note:string):{estado:Exclude<EstadoFleteMvp167,'no_informado'|'contradictorio'>;importe:string|null}|null{
 const s=clean(note);
 if(!/\b(?:flete|envio|transporte|entrega)\b/u.test(s)||uncertain.test(note))return null;
 const isAgree=/\b(?:flete|envio|transporte|entrega)\s+(?:a convenir|a cotizar|a definir)\b/u.test(s);
 const free=/(?:\b(?:flete|envio|transporte|entrega)\s+(?:sin cargo|gratis|gratuito)\b|\b(?:sin cargo|gratis)\s+(?:el\s+)?(?:flete|envio|transporte)\b)/u.test(s);
 const included=/(?:\b(?:flete|envio|transporte)\s+incluido\b|\b(?:incluye|incluido|con)\s+(?:el\s+)?(?:flete|envio|transporte)\b)/u.test(s);
 const additional=/(?:\b(?:flete|envio|transporte)\s+(?:adicional|aparte|no incluido|a cargo del comprador)\b|\b(?:no incluye|sin)\s+(?:el\s+)?(?:flete|envio|transporte)\b)/u.test(s);
 const count=[isAgree,free,included,additional].filter(Boolean).length;
 if(count>1)return null;
 const matches=[...s.matchAll(new RegExp(priceRe.source,'giu'))];
 // Un importe en la misma frase no necesariamente es el importe del flete:
 // exigir un ÚNICO monto y que se vincule al término.
 const sum=matches.length===1?normAmount(matches[0][1]):null;
 const hasAmount=matches.length>0;
 if(hasAmount&&(matches.length!==1||sum===null))return null;
 if(isAgree)return {estado:'a_convenir',importe:null};
 if(free&&hasAmount&&sum!=='0.00')return null;
 if(free)return {estado:'sin_cargo',importe:'0.00'};
 if(included)return hasAmount?null:{estado:'incluido',importe:'0.00'};
 if(additional)return {estado:hasAmount?'adicional_con_importe':'adicional_sin_importe',importe:sum};
 // "Flete: $123" is not enough to know whether already in total.
 if(hasAmount&&/\b(?:flete|envio|transporte)\s*:\s*(?:ar\s*\$|\$)/u.test(s))
  return {estado:'importe_sin_tratamiento',importe:sum};
 return null;
}
function pay(note:string):EstadoPagoMvp167|null{
 const s=clean(note);
 if(uncertain.test(note)||!/\b(?:pago|condiciones de pago|forma de pago)\b/u.test(s))return null;
 const cash=/\b(?:contado|efectivo)\b/u.test(s);
 const transfer=/\btransferencia\b/u.test(s);
 const account=/\bcuenta corriente\s+(?:a\s*)?30\s+dias\b/u.test(s);
 const count=[cash,transfer,account].filter(Boolean).length;
 if(count>1)return 'multiple';
 return cash?'contado':transfer?'transferencia':account?'cuenta_corriente_30_dias':null;
}
function locations(rows:readonly {loc:UbicacionMvp167}[]):readonly UbicacionMvp167[]{
 return Object.freeze(rows.map(x=>Object.freeze({...x.loc})));
}
function empty():ResultadoCondicionesMvp167{
 return Object.freeze({
  estado:'fuente_no_acreditada',iva:{estado:'no_informado',tasa:null,ubicaciones:[]},
  flete:{estado:'no_informado',importe:null,ubicaciones:[]},
  pago:{estado:'no_informado',ubicaciones:[]},
  netoSinIvaAcreditado:false,stockCorroborado:false,
  plazoCorroborado:false,minimoCompraCorroborado:false,
  rankingHabilitado:false,originalesModificados:false,contactosRevelados:false
 });
}
/**
 * No incluye datos textuales ni identificatorios en el resultado.
 * Los localizadores son de la extracción: XLSX/DOCX no son celdas reales.
 */
export function auditarCondicionesFuenteMvp167(
 doc:DocumentoFuente,filas:readonly FilaOriginalMvp166[],
 hashBytesVerificado:string
):ResultadoCondicionesMvp167{
 const p=doc?.prueba;
 if(!doc||!p||!HASH.test(hashBytesVerificado)||
  hashBytesVerificado!==doc.sourceSha256||p.sourceSha256!==doc.sourceSha256||
  p.requestId!==doc.requestId||p.messageHmac!==doc.messageHmac||
  p.state!=='verified'||p.reason!=='covered'||p.version<9||
  p.rankingAllowed!==false||p.revisionVigente!==true||p.cotizacionVigente!==true||
  !Array.isArray(doc.lineas)||p.lineCount!==doc.lineas.length||
  !Array.isArray(filas)||filas.length<1||filas.length>5000||
  filas.some(r=>!r||!Number.isSafeInteger(r.pagina)||r.pagina<1||
   !Number.isSafeInteger(r.fila)||r.fila<1||
   typeof r.texto!=='string'||r.texto.length>4000)||
  new Set(filas.map(r=>r.pagina+':'+r.fila)).size!==filas.length)
  return empty();
 const declared=centavosFuenteMvp162(doc.declaredTotalLiteral);
 if(declared===null||p.declaredTotalCents===null||
  !/^\d{1,15}$/u.test(p.declaredTotalCents)||
  p.sumLineCents!==p.declaredTotalCents||
  declared!==BigInt(p.declaredTotalCents))return empty();
 let sum=0n;const seen=new Set<number>();
 for(const line of doc.lineas){
  const value=centavosFuenteMvp162(line.lineTotalLiteral);
  if(!Number.isSafeInteger(line.lineNo)||line.lineNo<1||
   seen.has(line.lineNo)||value===null)return empty();
  seen.add(line.lineNo);sum+=value;
 }
 if(sum!==declared)return empty();
 const ivaEntries:({loc:UbicacionMvp167;estado:Exclude<EstadoIvaMvp167,'no_informado'|'contradictorio'>;tasa:'0'|'10.5'|'21'|null})[]=[];
 const fleteEntries:({loc:UbicacionMvp167;estado:Exclude<EstadoFleteMvp167,'no_informado'|'contradictorio'>;importe:string|null})[]=[];
 const pagoEntries:({loc:UbicacionMvp167;estado:EstadoPagoMvp167})[]=[];
 for(const row of filas){
  const note=row.texto.trim();
  // Short terms only, not products, hidden document instructions or tables.
  if(!note||note.length>320)continue;
  const loc={pagina:row.pagina,fila:row.fila};
  const ivResult=iv(note),frResult=fr(note),payResult=pay(note);
  if(ivResult)ivaEntries.push({loc,...ivResult});
  if(frResult)fleteEntries.push({loc,...frResult});
  if(payResult)pagoEntries.push({loc,estado:payResult});
 }
 const ivaStates=[...new Set(ivaEntries.map(x=>x.estado))];
 const rates=[...new Set(ivaEntries.map(x=>x.tasa).filter((x):x is '0'|'10.5'|'21'=>x!==null))];
 const ivaConflicts=ivaStates.length>1||rates.length>1;
 const ivaEstado:EstadoIvaMvp167=ivaConflicts?'contradictorio':ivaStates[0]??'no_informado';
 const freightStates=[...new Set(fleteEntries.map(x=>x.estado))];
 const freightAmounts=[...new Set(fleteEntries.map(x=>x.importe).filter((x):x is string=>x!==null))];
 const freightConflict=freightStates.length>1||freightAmounts.length>1;
 const freightEstado:EstadoFleteMvp167=freightConflict?'contradictorio':freightStates[0]??'no_informado';
 const pays=[...new Set(pagoEntries.map(x=>x.estado))];
 const pagoEstado:EstadoPagoMvp167=pays.length>1||pays.includes('multiple')
  ?'multiple':pays[0]??'no_informado';
 return Object.freeze({
  estado:'fuente_leida' as const,
  iva:Object.freeze({estado:ivaEstado,
   tasa:ivaConflicts?null:rates[0]??null,ubicaciones:locations(ivaEntries)}),
  flete:Object.freeze({estado:freightEstado,
   importe:freightConflict?null:freightAmounts[0]??null,
   ubicaciones:locations(fleteEntries)}),
  pago:Object.freeze({estado:pagoEstado,ubicaciones:locations(pagoEntries)}),
  netoSinIvaAcreditado:false as const,stockCorroborado:false as const,
  plazoCorroborado:false as const,minimoCompraCorroborado:false as const,
  rankingHabilitado:false as const,originalesModificados:false as const,
  contactosRevelados:false as const
 });
}
