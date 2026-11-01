/**
 * MVP-053: explicit bidding-window instruction, NOT supplier lead time.
 * A WhatsApp buyer can omit it (5 days), or supply a separate line:
 * "Plazo de cotización: 3 días" ... "7 días".
 * Never infer bidding deadline from "entrega en N días" or prices.
 */
export type PlazoCotizacionMvp053=Readonly<{
 dias:3|4|5|6|7;
 textoMateriales:string;
 explicito:boolean;
}>;
const DIRECTIVA=/^\s*(?:plazo(?:\s+de\s+cotizaci[oó]n|\s+para\s+cotizar)?|tiempo\s+para\s+cotizar)\s*:\s*(\d{1,2})\s*d[ií]as?\s*$/iu;
const ENCABEZADO=/^\s*(?:plazo(?:\s+de\s+cotizaci[oó]n|\s+para\s+cotizar)?|tiempo\s+para\s+cotizar)\s*:/iu;
function fail():never{throw TypeError('mvp053_plazo_invalido')}
export function extraerPlazoCotizacionMvp053(raw:string):PlazoCotizacionMvp053{
 if(typeof raw!=='string'||!raw.trim()||raw.length>4000)fail();
 const lines=raw.split(/\r?\n/u);
 let plazo:3|4|5|6|7=5;
 let explicito=false;
 const material:string[]=[];
 for(const line of lines){
  if(!ENCABEZADO.test(line)){material.push(line);continue;}
  const match=line.match(DIRECTIVA);
  if(!match)fail();
  const n=Number(match[1]);
  if(!Number.isSafeInteger(n)||n<3||n>7||explicito)fail();
  plazo=n as 3|4|5|6|7;
  explicito=true;
 }
 const textoMateriales=material.join('\n').trim();
 if(!textoMateriales)fail();
 return Object.freeze({dias:plazo,textoMateriales,explicito});
}
