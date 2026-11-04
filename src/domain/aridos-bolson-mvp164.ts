/**
 * MVP164 — Regla comercial argentina: 1 BIG BAG / bolsón de áridos
 * normalmente es 1 m³ NOMINAL embolsado. No garantiza volumen real,
 * especificación técnica, IVA, flete ni disponibilidad.
 * Solo se usa sobre textos de fuente verificadas; nunca altera originales.
 */
export type Arido='arena'|'piedra'|'cascote'|'otro';
export type ResultadoBolson=Readonly<{
 estado:'no_aplica'|'fuente_no_acreditada'|'capacidad_ambigua'|
 'familia_distinta'|'volumen_distinto'|'variedad_distinta'|
 'variedad_no_informada'|'compatible_con_aclaracion'|'compatible_comercialmente';
 familia:Arido;
 presentacion:'big_bag'|'bolson'|'none';
 volumenM3PorUnidad:string|null;
 volumenM3Cotizado:string|null;
 cantidadNominalCoincide:boolean;
 origen:'convencion_nominal'|'capacidad_expresa'|'sin_fuente';
 especie:'corroborada'|'generica'|'contradictoria'|'no_aplica';
 permiteRanking:false;
}>;
export type EntradaBolson=Readonly<{
 pedidoDescripcion:string;pedidoCantidad:string;pedidoUnidad:string;
 ofertaDescripcion:string;ofertaCantidad:string;
 presentacionFuente:'big_bag'|'bolson'|'bag_weight'|'none';
 fuenteVerificada:boolean;presentacionComprobada:boolean;
}>;
/**
 * Las palabras del material no son por defecto exigencias excluyentes.
 * Solo una orden expresa de NO aceptar sustitución obliga a acreditar subtipo.
 */
const excluyente=(s:string)=>/\b(?:exclusivamente|unicamente|estrictamente|obligatoriamente|excluyente|sin sustitutos?|sin equivalentes|no aceptar (?:otra|otros|equivalentes)|debe ser|tiene que ser|solo si)\b/u.test(s);
const norm=(v:string)=>v.normalize('NFKC').toLocaleLowerCase('es-AR')
 .normalize('NFD').replace(/\p{M}/gu,'').replace(/\s+/gu,' ').trim();
const fixed=(v:bigint)=>String(v/1000n)+'.'+String(v%1000n).padStart(3,'0');
const num=(v:string):bigint|null=>{
 if(!/^(?:0|[1-9]\d{0,6})(?:[.,]\d{1,3})?$/u.test(v.trim()))return null;
 const [i,f='']=v.trim().replace(',','.').split('.');
 const n=BigInt(i)*1000n+BigInt(f.padEnd(3,'0')||'0');
 return n>0n&&n<1000000000n?n:null;
};
function family(d:string):Arido{
 const a=/\barena\b/u.test(d),p=/\b(?:piedra|granza|grava|gravilla|ripio)\b/u.test(d),
  c=/\bcascotes?\b/u.test(d);
 return Number(a)+Number(p)+Number(c)!==1?'otro':a?'arena':p?'piedra':'cascote';
}
function subtype(d:string,f:Arido):string{
 if(f==='cascote')return 'cascote';
 if(f==='arena'){
  const a=/\bfin[ao]\b/u.test(d),b=/\bgrues[ao]\b/u.test(d);
  return a===b?'generica':a?'fina':'gruesa';
 }
 if(f==='piedra'){
  const a=/\b(?:partid[ao]|triturad[ao])\b/u.test(d);
  const b=/\b(?:rodad[ao]|canto\s+rodado)\b/u.test(d);
  return a===b?'generica':a?'partida':'rodada';
 }
 return 'generica';
}
function pack(d:string):ResultadoBolson['presentacion']{
 return /\bbig[\s-]*b(?:a|ia)g\b/u.test(d)?'big_bag':
  /\bbolson(?:es)?\b/u.test(d)?'bolson':'none';
}
function volume(d:string):bigint|null|'ambigua'{
 // If source declares small/jumbo/fraction or weight-only BIG BAG,
 // never silently replace that declared format with standard nominal.
 const fraction=/\b(?:1\s*\/\s*2|1\s*\/\s*4)\b/u.test(d);
 const small=/\b(?:medio|media|mini|chico|pequeno|jumbo)\b/u.test(d);
 const weight=/\b\d+(?:[.,]\d+)?\s*(?:kg|kilos?|toneladas?)\b/u.test(d);
 if(fraction)return 'ambigua';
 const matches=[...d.matchAll(
  /(?:^|[^\p{L}\p{N}])(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:m3|metros?\s+cubicos?)(?![\p{L}\p{N}])/gu
 )];
 if(matches.length>1)return 'ambigua';
 if(matches.length===0)return small||weight?'ambigua':null;
 return num(matches[0][1])??'ambigua';
}
const out=(estado:ResultadoBolson['estado'],f:Arido,
 p:ResultadoBolson['presentacion'],unit:bigint|null,qty:bigint|null,
 origen:ResultadoBolson['origen'],especie:ResultadoBolson['especie'],
 coincide=false):ResultadoBolson=>Object.freeze({
 estado,familia:f,presentacion:p,
 volumenM3PorUnidad:unit===null?null:fixed(unit),
 volumenM3Cotizado:unit===null||qty===null?null:fixed((unit*qty+500n)/1000n),
 cantidadNominalCoincide:coincide,origen,especie,permiteRanking:false as const
});
export function interpretarBolsonAridosMvp164(x:EntradaBolson):ResultadoBolson{
 const pedido=norm(x?.pedidoDescripcion??''),oferta=norm(x?.ofertaDescripcion??'');
 const p=pack(oferta),f=family(oferta),required=family(pedido);
 if(!x||!['m3','metro cubico','metros cubicos'].includes(norm(x.pedidoUnidad))||
  required==='otro'||p==='none'||f==='otro'||
  !['big_bag','bolson'].includes(x.presentacionFuente))
  return out('no_aplica',f,p,null,null,'sin_fuente','no_aplica');
 if(x.fuenteVerificada!==true||x.presentacionComprobada!==true||
  x.presentacionFuente!==p)
  return out('fuente_no_acreditada',f,p,null,null,'sin_fuente','no_aplica');
 if(f!==required)
  return out('familia_distinta',f,p,null,null,'sin_fuente','contradictoria');
 const qty=num(x.ofertaCantidad),requested=num(x.pedidoCantidad),v=volume(oferta);
 if(qty===null||requested===null||v==='ambigua')
  return out('capacidad_ambigua',f,p,null,null,'sin_fuente','no_aplica');
 const per=v===null?1000n:v;
 const origen=v===null?'convencion_nominal':'capacidad_expresa';
 const coinciden=(per*qty+500n)/1000n===requested;
 const reqVariant=subtype(pedido,required),offerVariant=subtype(oferta,f);
 const species=reqVariant==='generica'||offerVariant===reqVariant?'corroborada':
  offerVariant==='generica'?'generica':'contradictoria';
 const state:ResultadoBolson['estado']=!coinciden?'volumen_distinto':
  species==='contradictoria'?'variedad_distinta':
  species==='generica'?(excluyente(pedido)?'variedad_no_informada':'compatible_con_aclaracion'):
  'compatible_comercialmente';
 return out(state,f,p,per,qty,origen,species,coinciden);
}
