/** Etapa 3 / MVP241 — Acreditación monetaria determinista, sin IA.
 *
 * El símbolo $ es ambiguo: no alcanza para afirmar ARS o USD.
 * Si la fuente tiene indicios de AMBAS monedas, no homogeneizar sus
 * renglones en una sola moneda ni permitir comparación automática.
 */
const ARS=/(?:\bARS\b|AR\$|\bPESOS?\s+ARGENTINOS?\b)/u;
const USD=/(?:\bUSD\b|U\$S|US\$|\bDOLARES?\b)/u;
const normalized=(s:string):string=>s.normalize('NFD')
 .replace(/[\u0300-\u036f]/gu,'').toUpperCase();

/** Exige que la evidencia literal mencione inequívocamente la moneda.
 * Acepta abreviaturas comerciales conocidas, NO presume ARS por "$".
 */
export function monedaExplicitaMvp241(
 fuente:unknown,
 declarada:unknown,
 evidencia:unknown
):boolean{
 if(typeof fuente!=='string'||fuente.length===0||
    typeof declarada!=='string')return false;
 const src=normalized(fuente);
 const hasARS=ARS.test(src),hasUSD=USD.test(src);
 // Una fuente mixta, aunque mencione una moneda prevalente,
 // requiere revisión por artículo y no admite etiqueta global.
 if(hasARS&&hasUSD)return false;
 if(declarada==='no_informada')
   return !hasARS&&!hasUSD&&evidencia===null;
 if(declarada!=='ARS'&&declarada!=='USD'||
    typeof evidencia!=='string'||evidencia.length===0||
    evidencia.length>240||!fuente.includes(evidencia))
   return false;
 const cited=normalized(evidencia);
 return declarada==='ARS'
   ?hasARS&&!hasUSD&&ARS.test(cited)&&!USD.test(cited)
   :hasUSD&&!hasARS&&USD.test(cited)&&!ARS.test(cited);
}
/** Para el comparador de ofertas tipadas que no incluye un campo
 * de cita de moneda, exigir al menos la declaración explícita en
 * el propio texto original. El lector de IA aplica la guarda más
 * fuerte, que verifica además la cita.
 */
export function monedaFuenteMvp241(fuente:unknown,declarada:unknown):boolean{
 if(typeof fuente!=='string'||typeof declarada!=='string')return false;
 const src=normalized(fuente);
 const ars=ARS.test(src),usd=USD.test(src);
 if(ars&&usd)return false;
 if(declarada==='no_informada')return !ars&&!usd;
 return declarada==='ARS'?ars&&!usd:
  declarada==='USD'?usd&&!ars:false;
}
