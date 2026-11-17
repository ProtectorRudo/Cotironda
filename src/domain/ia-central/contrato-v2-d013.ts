/** D013: conciliador semántico V2 sin alterar el contrato histórico pinneado.
 * El rubro es una etiqueta; cantidad, unidad y origen literal son prueba.
 */
import {RUBROS_MVP216,type RubroMvp216} from '../rubros-comprador-mvp216.ts';
import type {PropuestaArticulo,PropuestaPedido,ResultadoLectura} from './contrato-v1.ts';
export {localizarEvidenciasV1} from './contrato-v1.ts';
const decimal=/^(?:0|[1-9]\d{0,5})(?:\.\d{1,3})?$/u;
const texto=(v:unknown,max:number):v is string=>typeof v==='string'&&
 v.trim().length>0&&v.length<=max&&
 !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v);
const obj=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const rubro=(v:unknown):v is RubroMvp216=>
 typeof v==='string'&&Object.hasOwn(RUBROS_MVP216,v);
function cantidad(v:unknown):v is string{
 return typeof v==='string'&&decimal.test(v)&&
 Number.isFinite(Number(v))&&Number(v)>0&&Number(v)<=1000000;
}
/** Verifica cifras evidentes sin conocer una sola palabra del producto.
 * «tres» (cantidad escrita con palabras) requiere doble lector semántico. */
function cantidadRespaldada(evidencia:string,cant:string):boolean{
 const numbers=evidencia.match(/\d+(?:[.,]\d{1,3})*/gu)??[];
 if(numbers.length===0)return true;
 const requested=Number(cant);
 return numbers.some(raw=>{
  const variants=new Set<number>();
  variants.add(Number(raw.replace(',','.')));
  if(/^\d{1,3}(?:\.\d{3})+$/u.test(raw))
   variants.add(Number(raw.replace(/\./gu,'')));
  return variants.has(requested);
 });
}
/** MVP287: dos modelos pueden citar subtramos distintos del MISMO ítem.
 * La cita secundaria se busca en el ORIGINAL y debe solaparse con la
 * primaria, demostrar la MISMA cantidad y no tomarla de otro artículo.
 * No igualar unidades de volumen con bultos: eso cambia el presupuesto.
 */
function unidadCanonica(v:string):string{
 const t=v.trim().normalize('NFD').replace(/[\u0300-\u036f]/gu,'')
  .toLocaleLowerCase('es-AR');
 if(['bag','bolsa','bolsas','bolson','bolsones','bigbag','big bag'].includes(t))
  return 'bag';
 if(['unit','unidad','unidades','unid','u','un'].includes(t))
  return 'unit';
 if(['roll','rollo','rollos'].includes(t))return 'roll';
 if(['balde','baldes','bucket'].includes(t))return 'bucket';
 if(['box','caja','cajas'].includes(t))return 'box';
 if(['pack','packs','paquete','paquetes'].includes(t))return 'pack';
 if(['m3','m³','metro cubico','metros cubicos'].includes(t))return 'm3';
 if(['kg','kilo','kilos','kilogramo','kilogramos'].includes(t))return 'kg';
 if(['l','lt','lts','litro','litros'].includes(t))return 'l';
 if(['m','metro','metros'].includes(t))return 'm';
 if(['m2','m²','metro cuadrado','metros cuadrados'].includes(t))return 'm2';
 return t;
}
function unidadEquivalente(a:string,b:string,evidencia:string):boolean{
 const x=unidadCanonica(a),y=unidadCanonica(b);
 if(x===y)return true;
 // Contar envases no equivale a convertir su peso/volumen. Aceptar
 // "2 rollos" == "2 unidades" SOLO si la fuente menciona ese envase.
 const e=evidencia.normalize('NFD').replace(/[\u0300-\u036f]/gu,'')
  .toLocaleLowerCase('es-AR');
 const envases=[
  {unidad:'bag',patron:/\b(?:bolsas?|bolson(?:es)?|big\s?bags?)\b/u},
  {unidad:'roll',patron:/\brollos?\b/u},
  {unidad:'bucket',patron:/\bbaldes?\b/u},
  {unidad:'box',patron:/\bcajas?\b/u},
  {unidad:'pack',patron:/\b(?:packs?|paquetes?)\b/u}
 ];
 return envases.some(p=>p.patron.test(e)&&
  ((x===p.unidad&&y==='unit')||(x==='unit'&&y===p.unidad)));
}
/** El segundo lector puede citar un subtramo que incluya únicamente
 * la presentación ("25 kilos"), no la cantidad ("10 bolsas").
 * Ambos números quedan corroborados por el primer tramo literal completo
 * y por la cantidad independiente del segundo lector.
 * Impedir que la cita secundaria cruce a otro artículo.
 */
function citaVerificadaDelMismoItem(origen:string,
 primera:PropuestaArticulo,segunda:unknown,
 articulos:readonly PropuestaArticulo[]):boolean{
 if(!texto(segunda,1500))return false;
 let pos=origen.indexOf(segunda);
 let citaPropia=false;
 while(pos>=0){
  const fin=pos+segunda.length;
  // Una subcita repetida en OTRA línea no identifica el producto:
  // aunque coincida la cantidad, el origen queda ambiguo.
  if(articulos.some(x=>x!==primera&&pos<x.fin&&fin>x.inicio))
   return false;
  if(pos<primera.fin&&fin>primera.inicio)citaPropia=true;
  pos=origen.indexOf(segunda,pos+1);
 }
 return citaPropia;
}
function mismaLocalidadLeida(a:string|null,b:string|null):boolean{
 if(a===null||b===null)return a===b;
 const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/gu,'')
  .trim().toLocaleLowerCase('es-AR').replace(/[.,]+/gu,' ')
  .replace(/\s+/gu,' ');
 return fold(a)===fold(b);
}
const rejection=(motivo:string):ResultadoLectura=>
 Object.freeze({estado:'rechazado',motivo,pedido:null});
export function evaluarLecturasSemanticasV2D013(
 origen:unknown,primera:unknown,segunda:unknown
):ResultadoLectura{
 if(!texto(origen,12000)||!obj(primera)||!obj(segunda))
  return rejection('entrada_invalida');
 if(!['cotizar','consulta','saludo','otro'].includes(String(primera.intencion))||
    !Array.isArray(primera.articulos)||!Array.isArray(primera.dudas)||
    primera.articulos.length>200||primera.dudas.length>20)
  return rejection('esquema_invalido');
 if(primera.intencion!=='cotizar')
  return Object.freeze({estado:'no_es_pedido',motivo:'intencion_no_comercial',pedido:null});
 if(primera.articulos.length<1)return rejection('sin_articulos');
 if(!(primera.zona_entrega===null||texto(primera.zona_entrega,120))||
    primera.dudas.some((x:unknown)=>!texto(x,250)))
  return rejection('campos_inseguros');
 if(!['completa','faltan_articulos','dudosa'].includes(String(segunda.integridad))||
    !Array.isArray(segunda.articulos)||
    !(segunda.zona_entrega===null||texto(segunda.zona_entrega,120)))
  return rejection('segunda_lectura_invalida');
 const accepted:PropuestaArticulo[]=[];
 const intervals:{inicio:number;fin:number}[]=[];
 for(const entry of primera.articulos){
  if(!obj(entry))return rejection('articulo_sin_evidencia_verificable');
  const start=entry.inicio,end=entry.fin,ev=entry.evidencia;
  if(!texto(ev,1500)||typeof start!=='number'||typeof end!=='number'||
     !Number.isSafeInteger(start)||!Number.isSafeInteger(end)||
     start<0||end<=start||end>origen.length||
     origen.slice(start,end)!==ev||
     !texto(entry.descripcion,500)||!cantidad(entry.cantidad)||
     !cantidadRespaldada(ev,entry.cantidad)||
     !texto(entry.unidad,80)||!rubro(entry.rubro)||
     !(entry.presentacion===null||texto(entry.presentacion,200))||
     !(entry.aclaracion===null||texto(entry.aclaracion,250)))
   return rejection('articulo_sin_evidencia_verificable');
  if(intervals.some(x=>start<x.fin&&end>x.inicio))
   return rejection('evidencias_superpuestas');
  intervals.push({inicio:start,fin:end});
  accepted.push(entry as unknown as PropuestaArticulo);
 }
 if(segunda.integridad!=='completa'||
    !mismaLocalidadLeida(primera.zona_entrega,segunda.zona_entrega)||
    segunda.articulos.length!==accepted.length||primera.dudas.length>0)
  return Object.freeze({
   estado:'requiere_aclaracion',motivo:'lecturas_incompletas_o_divergentes',
   pedido:null
  });
 // El rubro es una etiqueta comercial, no un criterio técnico.
 // Emparejar las lecturas por citas ancladas en el ORIGINAL, aunque
 // el verificador cambie el orden. Exigir asignación única y completa:
 // dos menciones indistinguibles siguen requiriendo revisión.
 const itemsSegunda=segunda.articulos as unknown[];
 const sinUsar=new Set(itemsSegunda.map((_:unknown,i:number)=>i));
 for(const a of accepted){
  const posibles=[...sinUsar].filter(i=>{
   const b=itemsSegunda[i];
   return obj(b)&&rubro(b.rubro)&&
    citaVerificadaDelMismoItem(origen,a,b.evidencia,accepted)&&
    cantidad(b.cantidad)&&Number(b.cantidad)===Number(a.cantidad)&&
    texto(b.unidad,80)&&unidadEquivalente(a.unidad,b.unidad,a.evidencia);
  });
  if(posibles.length!==1)
   return Object.freeze({
    estado:'requiere_aclaracion',motivo:'lecturas_discrepan_en_articulo',
    pedido:null
   });
  sinUsar.delete(posibles[0]);
 }
 if(sinUsar.size!==0)
  return Object.freeze({
   estado:'requiere_aclaracion',motivo:'lecturas_discrepan_en_articulo',
   pedido:null
  });
 if(primera.zona_entrega===null)
  return Object.freeze({
   estado:'requiere_aclaracion',motivo:'zona_de_entrega_faltante',
   pedido:null
  });
 return Object.freeze({
  estado:'listo_para_preparar',motivo:'doble_lectura_con_fuente',
  pedido:Object.freeze({
   intencion:'cotizar' as const,zona_entrega:primera.zona_entrega as string,
   articulos:Object.freeze(accepted),
   dudas:Object.freeze([] as string[])
  })
 });
}

