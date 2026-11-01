/**
 * MVP-063 — VERBATIM source mirror of a supplier's TEXT quote.
 *
 * This is NOT the material matcher, economic normalizer, invoice checker
 * or AI parser. Every original line and its order are retained verbatim,
 * including extra pallets/bolsones, taxes, discounts, freight, notes and
 * unknown material. Never replace a seller-stated total with a calculation.
 *
 * Source bytes are hashed (SHA-256) to permit independent evidence checks.
 * Existing encrypted inbox D028 is the authenticated private source; do
 * NOT expose this object through a public API without buyer authorization.
 * PDF/image/Excel need separate immutable original-file storage.
 */
import {createHash} from 'node:crypto';

export type RenglonFuenteMvp063=Readonly<{
 numero:number;
 textoExacto:string;
 importesLiterales:readonly string[];
}>;
export type TotalFuenteMvp063=Readonly<{
 numeroLinea:number;
 lineaExacta:string;
 importeLiteral:string;
 moneda:'ARS';
 importeDecimal:string;
}>;
export type EspejoPresupuestoMvp063=Readonly<{
 tipo:'texto_original_copia_fiel';
 textoOriginal:string;
 sha256:string;
 renglones:readonly RenglonFuenteMvp063[];
 totalDeclarado:TotalFuenteMvp063|null;
 estadoTotal:'explicitamente_verificado'|'no_detectado'|'ambiguo_no_verificado';
 comparacion:'requiere_conciliacion_independiente';
 fuenteSoloTexto:true;
}>;

const CURRENCY=/\$\s*[0-9][0-9.,]*/gu;
// Only allow a final, explicitly denominated ARS amount.
// Dot or comma in a group of 3 without decimals is ambiguous: preserve
// source but DO NOT silently decide 12.100 => 12100.
const TOTAL=/^\s*(?:total(?:\s+(?:final|general|a\s+pagar))?|importe\s+total)\s*[:=\-]?\s*(\$\s*[0-9][0-9.,]*)\s*(?:ARS|pesos)?\s*$/iu;
const TOTAL_HEAD=/^\s*(?:total(?:\b|\s)|importe\s+total\b)/iu;
function fail():never{throw new TypeError('mvp063_fuente_original_invalida')}
/** Preserve literal currency token; only normalize for independent math. */
function arsDecimal(token:string):string|null{
 if(typeof token!=='string'||!/^\$\s*[0-9][0-9.,]*$/u.test(token))return null;
 const raw=token.replace(/^\$\s*/u,'');
 let value:string;
 if(/^(?:0|[1-9]\d{0,8})(?:[.,]\d{1,2})?$/u.test(raw)){
  value=raw.replace(',','.');
 }else if(/^[1-9]\d{0,2}(?:\.\d{3})+,\d{1,2}$/u.test(raw)){
  value=raw.replace(/\./gu,'').replace(',','.');
 }else if(/^[1-9]\d{0,2}(?:,\d{3})+\.\d{1,2}$/u.test(raw)){
  value=raw.replace(/,/gu,'');
 }else return null;
 const [whole,fraction='']=value.split('.');
 if(BigInt(whole)>999999999n)return null;
 return BigInt(whole).toString()+'.'+fraction.padEnd(2,'0');
}
/**
 * A copy of a source is faithful even when its structured extraction is
 * incomplete. Source lines NEVER depend on requested materials or catalog.
 * Parsing total does not make the quote economically comparable.
 */
export function capturarPresupuestoOriginalMvp063(
 texto:string
):EspejoPresupuestoMvp063{
 if(typeof texto!=='string'||texto.length<1||texto.length>18000||
   /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(texto))fail();
 const rawLines=texto.split(/\r\n|\n|\r/u);
 if(rawLines.length>350)fail();
 const renglones=rawLines.map((line,i):RenglonFuenteMvp063=>Object.freeze({
  numero:i+1,textoExacto:line,
  importesLiterales:Object.freeze([...line.matchAll(CURRENCY)].map(m=>m[0]))
 }));
 const candidates:TotalFuenteMvp063[]=[];
 let indeterminate=false;
 for(const line of renglones){
  if(!TOTAL_HEAD.test(line.textoExacto))continue;
  const match=line.textoExacto.match(TOTAL);
  if(!match){indeterminate=true;continue}
  const amount=arsDecimal(match[1]);
  if(amount===null){indeterminate=true;continue}
  candidates.push(Object.freeze({
   numeroLinea:line.numero,lineaExacta:line.textoExacto,
   importeLiteral:match[1],moneda:'ARS' as const,importeDecimal:amount
  }));
 }
 const verified=!indeterminate&&candidates.length===1;
 return Object.freeze({
  tipo:'texto_original_copia_fiel',
  textoOriginal:texto,
  sha256:createHash('sha256').update(texto,'utf8').digest('hex'),
  renglones:Object.freeze(renglones),
  totalDeclarado:verified?candidates[0]:null,
  estadoTotal:verified?'explicitamente_verificado':
    indeterminate||candidates.length>1?'ambiguo_no_verificado':'no_detectado',
  comparacion:'requiere_conciliacion_independiente',
  fuenteSoloTexto:true
 });
}
/**
 * Full-line fidelity audit. A comparison/extraction may annotate some
 * original source lines, but it MUST NOT silently omit the others.
 * An unrecognized line remains an original source line, not "deleted".
 */
export function separarAlcancePresupuestoMvp063(
 espejo:EspejoPresupuestoMvp063,
 correlaciones:readonly Readonly<{
  numeroLinea:number;alcance:'solicitado'|'no_solicitado'|'cargo'|
   'descuento'|'aclaracion';
 }>[]
):Readonly<{
 solicitados:readonly RenglonFuenteMvp063[];
 noSolicitados:readonly RenglonFuenteMvp063[];
 cargos:readonly RenglonFuenteMvp063[];
 descuentos:readonly RenglonFuenteMvp063[];
 noClasificados:readonly RenglonFuenteMvp063[];
 totalDeclarado:TotalFuenteMvp063|null;
 fuenteSha256:string;
}>{
 if(!espejo||!Array.isArray(correlaciones)||correlaciones.length>350)fail();
 const buckets={
  solicitado:[] as RenglonFuenteMvp063[],
  no_solicitado:[] as RenglonFuenteMvp063[],
  cargo:[] as RenglonFuenteMvp063[],
  descuento:[] as RenglonFuenteMvp063[],
  aclaracion:[] as RenglonFuenteMvp063[]
 };
 const mark=new Map<number,keyof typeof buckets>();
 for(const x of correlaciones){
  if(!x||!Number.isSafeInteger(x.numeroLinea)||x.numeroLinea<1||
   x.numeroLinea>espejo.renglones.length||!Object.hasOwn(buckets,x.alcance)||
   mark.has(x.numeroLinea))fail();
  mark.set(x.numeroLinea,x.alcance);
 }
 const others:RenglonFuenteMvp063[]=[];
 for(const line of espejo.renglones){
  const target=mark.get(line.numero);
  if(target)buckets[target].push(line);
  else others.push(line);
 }
 return Object.freeze({
  solicitados:Object.freeze(buckets.solicitado),
  noSolicitados:Object.freeze(buckets.no_solicitado),
  cargos:Object.freeze(buckets.cargo),
  descuentos:Object.freeze(buckets.descuento),
  noClasificados:Object.freeze([...buckets.aclaracion,...others]
   .sort((a,b)=>a.numero-b.numero)),
  totalDeclarado:espejo.totalDeclarado,
  fuenteSha256:espejo.sha256
 });
}
