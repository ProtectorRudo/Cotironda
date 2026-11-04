/**
 * MVP166 — precios tras descuentos con evidencia del TEXTO FUENTE POSICIONADO.
 * Puro, privado, NO prueba IVA, neto fiscal, stock, flete o ranking.
 * El servidor debe descargar original privado, verificar SHA256 de BYTES y
 * proporcionar todas las filas extraídas; nunca aceptar propuestas del cliente.
 */
import {
 centavosFuenteMvp162,cantidadFuenteMvp162,
 type DocumentoFuente
} from './adaptador-documental-mvp162.ts';

export type FilaOriginalMvp166=Readonly<{
 pagina:number;fila:number;texto:string;
}>;
export type EstadoPrecioMvp166=
 'descuento_explicito_conciliado'|'importe_sin_ajuste_conciliado'|
 'fila_no_univoca'|'descuento_ambiguo'|'importe_no_conciliado'|
 'datos_insuficientes';
export type PrecioAuditadoMvp166=Readonly<{
 linea:number;pagina:number|null;fila:number|null;
 estado:EstadoPrecioMvp166;descuentoPorcentaje:string|null;
 /** Tras descuento comercial, NO es necesariamente neto sin IVA. */
 unitarioComercialTrasDescuento:string|null;ivaAcreditado:false;
}>;
export type AuditoriaDescuentosMvp166=Readonly<{
 estado:'fuente_no_acreditada'|'parcial'|'descuentos_conciliados_sin_iva';
 precios:readonly PrecioAuditadoMvp166[];
 rankingHabilitado:false;contactosRevelados:false;originalesModificados:false;
}>;
const HASH=/^[a-f0-9]{64}$/u;
const normal=(x:string)=>x.normalize('NFKC').toLocaleLowerCase('es-AR')
 .normalize('NFD').replace(/\p{M}/gu,'').replace(/\s+/gu,' ').trim();
const escape=(x:string)=>[...x].map(c=>'\\.^$*+?()[]{}|'.includes(c)?'\\'+c:c).join('');
const format=(c:bigint)=>String(c/100n)+'.'+String(c%100n).padStart(2,'0');
const round=(a:bigint,b:bigint)=>(a+b/2n)/b;
const quantity=(x:unknown):bigint|null=>{
 const q=cantidadFuenteMvp162(x);
 if(q===null)return null;
 const [w,fr='']=q.split('.');
 return BigInt(w)*1000n+BigInt(fr.padEnd(3,'0')||'0');
};
const listed=(x:string)=>normal(x).replace(/\$\s*/gu,'');
const has=(row:string,token:string):boolean=>{
 const s=listed(row),t=listed(token);
 return new RegExp('(?<![\\p{L}\\p{N}.,])'+escape(t)+
  '(?![\\p{L}\\p{N}.,])','u').test(s);
};
const removedSuffix=(x:string)=>x.replace(
 /;\s*(?:dscto\.?|descuento|bonif(?:icacion)?\.?|dto\.?)\s*:?\s*\d{1,2}(?:[.,]\d{1,2})?\s*%\s*$/iu,'').trim();
const basis=(x:string):bigint|null=>{
 if(!/^\d{1,2}(?:[.,]\d{1,2})?$/u.test(x))return null;
 const [w,fr='']=x.replace(',','.').split('.');
 const n=BigInt(w)*100n+BigInt(fr.padEnd(2,'0')||'0');
 return n<10000n?n:null;
};
const pct=(x:bigint)=>String(x/100n)+'.'+String(x%100n).padStart(2,'0');
const labelled=/(?:\b(?:dscto\.?|descuento|bonificacion|bonif\.?|dto\.?)\s*:?\s*)(\d{1,2}(?:[.,]\d{1,2})?)\s*%/giu;
const percentages=/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/gu;
const globalOnly=/^\s*(?:dscto\.?|descuento|bonificacion|bonif\.?|dto\.?)\s*:?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*$/iu;
function rate(row:string,rows:readonly FilaOriginalMvp166[]):bigint|null|'ambigua'{
 const labels=[...row.matchAll(labelled)].map(x=>basis(x[1]));
 const all=[...row.matchAll(percentages)].map(x=>basis(x[1]));
 if(labels.some(x=>x===null)||all.some(x=>x===null))return 'ambigua';
 // Otro porcentaje en mismo renglón (IVA, recargo) impide atribuir la tasa.
 if(labels.length===1&&all.length===1&&labels[0]===all[0])return labels[0]!;
 if(labels.length>0)return 'ambigua';
 const heading=rows.some(x=>
  /\b(?:dscto\.?|descuento|bonificacion)\b/iu.test(x.texto)&&
  /\b(?:cant(?:idad)?|descripcion|item|producto)\b/iu.test(x.texto));
 const global=rows.map(x=>x.texto.match(globalOnly)).filter((x):x is RegExpMatchArray=>x!==null);
 if(all.length===0&&global.length===1&&!rows.some(x=>
  /\b(?:otros? descuentos?|bonificacion adicional)\b/iu.test(x.texto)))
  return basis(global[0][1]);
 if(all.length===1&&heading&&!/\b(?:iva|interes|recargo)\b/iu.test(row))
  return all[0]!;
 return all.length===0?null:'ambigua';
}
function missing(linea:number,estado:EstadoPrecioMvp166,
 row?:FilaOriginalMvp166):PrecioAuditadoMvp166{
 return Object.freeze({linea,pagina:row?.pagina??null,fila:row?.fila??null,
  estado,descuentoPorcentaje:null,unitarioComercialTrasDescuento:null,
  ivaAcreditado:false as const});
}
const invalid=():AuditoriaDescuentosMvp166=>Object.freeze({
 estado:'fuente_no_acreditada',precios:Object.freeze([]),
 rankingHabilitado:false,contactosRevelados:false,originalesModificados:false
});
/** Solo un servicio privado puede proporcionar un hash de bytes comprobado. */
export function auditarDescuentosFuenteMvp166(
 doc:DocumentoFuente,filas:readonly FilaOriginalMvp166[],
 sha256BytesComprobado:string
):AuditoriaDescuentosMvp166{
 const p=doc?.prueba;
 if(!doc||!p||!HASH.test(sha256BytesComprobado)||
  sha256BytesComprobado!==doc.sourceSha256||
  p.sourceSha256!==doc.sourceSha256||p.requestId!==doc.requestId||
  p.messageHmac!==doc.messageHmac||p.state!=='verified'||
  p.reason!=='covered'||p.version<9||!p.revisionVigente||
  !p.cotizacionVigente||p.rankingAllowed!==false||
  !Array.isArray(doc.lineas)||doc.lineas.length!==p.lineCount||
  !Array.isArray(filas)||filas.length===0||filas.length>5000||
  filas.some(r=>!r||!Number.isSafeInteger(r.pagina)||r.pagina<1||
   !Number.isSafeInteger(r.fila)||r.fila<1||
   typeof r.texto!=='string'||r.texto.length>4000)||
  new Set(filas.map(r=>r.pagina+':'+r.fila)).size!==filas.length)
  return invalid();
 const declared=centavosFuenteMvp162(doc.declaredTotalLiteral);
 const verified=p.declaredTotalCents;
 if(declared===null||verified===null||!/^\d{1,15}$/u.test(verified)||
  declared!==BigInt(verified)||p.sumLineCents!==verified)
  return invalid();
 let sum=0n;
 const seen=new Set<number>();
 for(const l of doc.lineas){
  const total=centavosFuenteMvp162(l.lineTotalLiteral);
  if(!Number.isSafeInteger(l.lineNo)||l.lineNo<1||
   seen.has(l.lineNo)||total===null)return invalid();
  seen.add(l.lineNo);sum+=total;
 }
 if(sum!==declared)return invalid();
 const consumed=new Set<string>(),result:PrecioAuditadoMvp166[]=[];
 for(const line of doc.lineas){
  if(typeof line.descriptionLiteral!=='string'||!line.descriptionLiteral.trim()){
   result.push(missing(line.lineNo,'datos_insuficientes'));continue;
  }
  const desc=normal(removedSuffix(line.descriptionLiteral));
  const q=quantity(line.quantityLiteral),unit=centavosFuenteMvp162(line.unitPriceLiteral),
   total=centavosFuenteMvp162(line.lineTotalLiteral);
  if(!desc||q===null||unit===null||total===null){
   result.push(missing(line.lineNo,'datos_insuficientes'));continue;
  }
  const matches=filas.filter(r=>{
   const row=normal(r.texto);
   return row.includes(desc)&&has(row,line.quantityLiteral!)&&
    has(row,line.unitPriceLiteral!)&&has(row,line.lineTotalLiteral!);
  });
  if(matches.length!==1||consumed.has(matches[0].pagina+':'+matches[0].fila)){
   result.push(missing(line.lineNo,'fila_no_univoca'));continue;
  }
  const row=matches[0];consumed.add(row.pagina+':'+row.fila);
  const b=rate(normal(row.texto),filas);
  if(b==='ambigua'){
   result.push(missing(line.lineNo,'descuento_ambiguo',row));continue;
  }
  const net=b===null?unit:round(unit*(10000n-b),10000n);
  const expected=round(net*q,1000n);
  if(expected!==total){
   result.push(missing(line.lineNo,'importe_no_conciliado',row));continue;
  }
  result.push(Object.freeze({
   linea:line.lineNo,pagina:row.pagina,fila:row.fila,
   estado:b===null?'importe_sin_ajuste_conciliado' as const:
    'descuento_explicito_conciliado' as const,
   descuentoPorcentaje:b===null?null:pct(b),
   unitarioComercialTrasDescuento:format(net),
   ivaAcreditado:false as const
  }));
 }
 return Object.freeze({
  estado:result.every(x=>x.unitarioComercialTrasDescuento!==null)?
   'descuentos_conciliados_sin_iva' as const:'parcial' as const,
  precios:Object.freeze(result),rankingHabilitado:false as const,
  contactosRevelados:false as const,originalesModificados:false as const
 });
}
