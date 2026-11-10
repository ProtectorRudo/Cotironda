import {cantidadFuenteMvp162} from './adaptador-documental-mvp162.ts';
import type {LineaFuente,PedidoItemOriginalMvp170,HechosPresentacionMvp170} from './adaptador-documental-mvp162.ts';
import {evaluarEquivalenciaCatalogoMvp171} from './equivalencia-catalogo-mvp171.ts';

/** A normalized, commercial diagnostic, NEVER fiscal/stock proof. */
type Pedido=PedidoItemOriginalMvp170&Readonly<{familia:string}>;
type Estado='alternativa_comercial_con_aclaracion'|'cantidad_diferente'|
 'presentacion_sin_acreditar'|'presentacion_ambigua'|'no_aplica';
type Evidencia=HechosPresentacionMvp170['lines'][number];
export type EstadoPresentacionMvp174=Readonly<{itemId:string;lineNo:number|null;estado:Estado}>;
const normal=(s:string)=>s.normalize('NFKC').toLocaleLowerCase('es-AR')
 .normalize('NFD').replace(/\p{M}/gu,'').replace(/\s+/gu,' ').trim();
const peso=/\b(\d{1,3})(?:[.,](\d{1,2}))?\s*(?:kg|kilos?|kilogramos?)\b/gu;
const litros=/\b(\d{1,3})(?:[.,](\d{1,2}))?\s*(?:l|lt|lts|litros?)\b/gu;
const cantidad=(value:unknown):bigint|null=>{
 const v=cantidadFuenteMvp162(value);
 if(v===null)return null;
 const [w,d='']=v.split('.');
 return BigInt(w)*1000n+BigInt(d.padEnd(3,'0')||'0');
};
const pedidoMili=(s:string):bigint|null=>{
 if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/u.test(s))return null;
 const [w,d='']=s.split('.');
 return BigInt(w)*1000n+BigInt(d.padEnd(3,'0')||'0');
};
const envase=(s:string,re:RegExp):bigint|null=>{
 const found=[...normal(s).matchAll(re)];
 if(found.length!==1)return null;
 const [_,w,d='']=found[0];
 const n=BigInt(w)*100n+BigInt(d.padEnd(2,'0')||'0');
 return n>0n&&n<=100000n?n:null;
};
const salida=(itemId:string,estado:Estado='no_aplica',lineNo:number|null=null):
 EstadoPresentacionMvp174=>Object.freeze({itemId,estado,lineNo});
const familia=(s:string)=>{
 const x=normal(s);
 const c=/\b(cemento|cpc|portland)\b/u.test(x);
 const h=/\b(hidrofugo|ceresita)\b/u.test(x);
 return c&&!h?'cemento_gris_obra':h&&!c?'hidrofugo':null;
};
const fijo=(milli:bigint)=>(milli/1000n).toString()+'.'+
 (milli%1000n).toString().padStart(3,'0');

/** Invocation requires full v9/SHA source validation by MVP172 first. */
export function cotejarPresentacionObraMvp174(
 item:Pedido,lineas:readonly LineaFuente[],hechos:readonly Evidencia[]
):EstadoPresentacionMvp174{
 if(!item||!Array.isArray(lineas)||!Array.isArray(hechos)||
  !['cemento_gris_obra','hidrofugo'].includes(item.familia)||
  !(item.familia==='cemento_gris_obra'?item.unidad==='bag':item.unidad==='l'))
  return salida(item?.id??'item_invalido');
 const buyer=normal(item.descripcionLiteral);
 const requested=pedidoMili(item.cantidad);
 const buyerPack=item.familia==='cemento_gris_obra'?envase(buyer,peso):100n;
 if(requested===null||requested<=0n||buyerPack===null)
  return salida(item.id,'presentacion_sin_acreditar');
 const candidates=lineas.filter(l=>familia(l.descriptionLiteral)===item.familia);
 if(!candidates.length)return salida(item.id);
 if(candidates.length!==1)return salida(item.id,'presentacion_ambigua');
 const line=candidates[0],e=hechos.find(x=>x.lineNo===line.lineNo);
 if(!e||!Number.isSafeInteger(line.lineNo)||line.lineNo<1||
  e.page===null||e.row===null||!Number.isSafeInteger(e.page)||e.page<1||
  !Number.isSafeInteger(e.row)||e.row<1||
  !['explicit','not_explicit'].includes(e.unitStatus))
  return salida(item.id,'presentacion_sin_acreditar',line.lineNo);
 const pack=envase(line.descriptionLiteral,
  item.familia==='cemento_gris_obra'?peso:litros);
 const offered=cantidad(line.quantityLiteral);
 if(pack===null||offered===null||offered<=0n)
  return salida(item.id,'presentacion_sin_acreditar',line.lineNo);
 const unit=e.unit??normal(line.unitLiteral??'');
 if(unit&&!['unit','bag','bolsa','bolsas','saco','sacos','u',
  'bidon','bidones','lata','latas'].includes(unit))
  return salida(item.id,'presentacion_ambigua',line.lineNo);
 const asked=requested*buyerPack,actual=offered*pack;
 if(asked!==actual)return salida(item.id,'cantidad_diferente',line.lineNo);
 const strict=/\b(exclusivamente|unicamente|excluyente|sin sustitutos|sin equivalentes)\b/u.test(buyer);
 const reqCpc=/\bcpc\b/u.test(buyer),offCpc=/\bcpc\b/u.test(normal(line.descriptionLiteral));
 const result=evaluarEquivalenciaCatalogoMvp171({
  familiaPedido:item.familia,familiaOferta:item.familia,
  familiaCatalogoAcreditada:false,familiaCotejadaEnTextoFuente:true,
  fuenteProveedorAcreditada:true,
  unidadCanonicaPedido:item.familia==='cemento_gris_obra'?'kg':'l',
  unidadCanonicaOferta:item.familia==='cemento_gris_obra'?'kg':'l',
  cantidadCanonicaPedido:fijo(asked/100n),
  cantidadCanonicaOferta:fijo(actual/100n),
  conversionPresentacionAcreditada:true,
  atributosPedido:reqCpc?[{clave:'tipo_cemento',valor:'cpc',obligatorio:strict}]:[],
  atributosOferta:offCpc?[{clave:'tipo_cemento',valor:'cpc',obligatorio:false}]:[]
 });
 if(result.estado==='no_acreditado')
  return salida(item.id,'presentacion_sin_acreditar',line.lineNo);
 if(result.estado==='incompatible')
  return salida(item.id,'presentacion_ambigua',line.lineNo);
 return salida(item.id,'alternativa_comercial_con_aclaracion',line.lineNo);
}
