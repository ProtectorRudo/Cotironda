/**
 * MVP-069 — local-only supplier catalogue rehearsal. CSV exported from Excel,
 * plain UTF-8 TXT or pasted text. Never writes a database, calls AI, Whapi or
 * enables a supplier product. Only D015-curated families can be recognised.
 * The returned matches are NOT a commercially confirmed supplier catalogue.
 */
import {identificarProducto} from './taxonomia-materiales.ts';
import {prepararPedidoTextoMvp028}
 from './pedido-piloto-mvp028.ts';
import {separarListaWhatsappNaturalMvp058}
 from './lista-whatsapp-natural-mvp058.ts';

export type FormatoCatalogoMvp069='csv'|'texto';
export type LineaCatalogoMvp069=Readonly<{
 fila:number;descripcion:string;producto_id:string;rubro:string;
}>;
export type PendienteCatalogoMvp069=Readonly<{
 fila:number;descripcion:string;motivo:'sin_familia_verificada'|
 'duplicado'|'formula_o_contenido_inseguro'|'descripcion_invalida'|
 'producto_no_corresponde_al_rubro';
}>;
export type LecturaCatalogoMvp069=Readonly<{
 estado:'interpretado_para_simulacion_sin_confirmar';
 reconocidos:readonly LineaCatalogoMvp069[];
 pendientes:readonly PendienteCatalogoMvp069[];
 avisos:readonly string[];
 totalFilas:number;
}>;
const MAX_BYTES=65536,MAX_FILAS=500,MAX_DESC=250;
const canon=(x:string)=>x.normalize('NFD')
 .replace(/[\u0300-\u036f]/gu,'').toLocaleLowerCase('es-AR')
 .replace(/\s+/gu,' ').trim();
const SAFE=/^[\p{L}\p{M}\p{N}\s.,()\/+º°²³%-]{2,250}$/u;
const FORMULA=/^[\s]*[=+@\-]/u;
function fail():never{throw Error('mvp069_catalogo_invalido')}
const columns=new Set(['producto','productos','material','materiales',
 'descripcion','descripcion articulo','descripcion producto','articulo','nombre']);
const categoryNames=new Set(['rubro','categoria','category','category_code']);
const priceNames=new Set(['precio','price','precio unitario','precio final',
 'costo','lista precio','pvp','importe']);
function csvRows(text:string,delimiter:string):string[][]{
 const out:string[][]=[];let fields:string[]=[],current='',quoted=false;
 let afterQuote=false;let beginning=true;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){
   if(ch==='"'&&text[i+1]==='"'){current+='"';i++;}
   else if(ch==='"'){quoted=false;afterQuote=true;}
   else current+=ch;
  }else if(ch==='"'){
   if(!beginning)fail();
   quoted=true;beginning=false;
  }else if(ch===delimiter){
   fields.push(current);current='';beginning=true;afterQuote=false;
  }else if(ch==='\n'||ch==='\r'){
   if(ch==='\r'&&text[i+1]==='\n')i++;
   fields.push(current);current='';beginning=true;afterQuote=false;
   if(fields.some(f=>f.trim()))out.push(fields);
   fields=[];
   if(out.length>MAX_FILAS+1)fail();
  }else{
   if(afterQuote&&!/\s/u.test(ch))fail();
   if(!afterQuote)current+=ch;
   if(!/\s/u.test(ch))beginning=false;
  }
  if(current.length>1200||fields.length>24)fail();
 }
 if(quoted)fail();
 fields.push(current);
 if(fields.some(f=>f.trim()))out.push(fields);
 if(out.length>MAX_FILAS+1)fail();
 return out;
}
function csvRecords(text:string):{entries:{fila:number;descripcion:string;rubro:string|null}[];
 warnings:string[]}{
 // Only a documented header-based CSV is accepted; never guess a column or
 // blindly interpret prices, quantities, stock or unrelated information.
 const first=(text.replace(/^\uFEFF/u,'').split(/\r?\n/u)[0]??'');
 const delimiters=[';',',','\t'];
 let header:null|{rows:string[][];col:number;rubro:number;price:boolean}=null;
 for(const sep of delimiters){
  let rows:string[][];
  try{rows=csvRows(text.replace(/^\uFEFF/u,''),sep)}catch{continue}
  if(!rows.length)continue;
  const names=rows[0].map(canon);
  const candidates=names.map((n,i)=>columns.has(n)?i:-1).filter(i=>i>=0);
  if(candidates.length!==1)continue;
  const category=names.findIndex(x=>categoryNames.has(x));
  header={rows,col:candidates[0],rubro:category,
   price:names.some(x=>priceNames.has(x))};
  break;
 }
 if(!header||!first)fail();
 if(header.rows.length-1>MAX_FILAS)fail();
 const warnings=header.price?['Las columnas de precios no se importan ni se usan para invitar.']:[];
 return {entries:header.rows.slice(1).map((row,i)=>({
  fila:i+2,descripcion:(row[header!.col]??'').trim(),
  rubro:header!.rubro>=0?(row[header!.rubro]??'').trim():null
 })),warnings};
}
export function analizarListadoComercioMvp069(
 texto:string,formato:FormatoCatalogoMvp069
):LecturaCatalogoMvp069{
 if((formato!=='csv'&&formato!=='texto')||
  typeof texto!=='string'||texto.length===0||
  new TextEncoder().encode(texto).length>MAX_BYTES||
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(texto))fail();
 const records=formato==='csv'?csvRecords(texto):{
  entries:texto.replace(/^\uFEFF/u,'').split(/\r\n|\n|\r/u)
   .map((descripcion,i)=>({fila:i+1,descripcion:descripcion.trim(),rubro:null})),
  warnings:[] as string[]
 };
 if(records.entries.length>MAX_FILAS)fail();
 const reconocidos:LineaCatalogoMvp069[]=[],pendientes:PendienteCatalogoMvp069[]=[];
 const seen=new Set<string>();
 for(const row of records.entries){
  const desc=row.descripcion.trim();
  if(!desc)continue;
  const unsafe=FORMULA.test(desc)||/https?:\/\/|www\.|[\t]/iu.test(desc);
  const reason:PendienteCatalogoMvp069['motivo']|null=
   unsafe?'formula_o_contenido_inseguro':
   desc.length>MAX_DESC||!SAFE.test(desc)?'descripcion_invalida':null;
  if(reason){pendientes.push({fila:row.fila,descripcion:desc.slice(0,MAX_DESC),motivo:reason});continue}
  const match=identificarProducto(desc);
  if(!match){pendientes.push({fila:row.fila,descripcion:desc,motivo:'sin_familia_verificada'});continue}
  const indicated=canon(row.rubro??'');
  if(indicated&&indicated!==match.rubro&&
    !(indicated==='corralon de materiales'&&match.rubro==='corralon')){
   pendientes.push({fila:row.fila,descripcion:desc,motivo:'producto_no_corresponde_al_rubro'});continue;
  }
  const key=canon(desc);
  if(seen.has(key)){
   pendientes.push({fila:row.fila,descripcion:desc,motivo:'duplicado'});continue;
  }
  seen.add(key);
  reconocidos.push({fila:row.fila,descripcion:desc,
   producto_id:match.producto_id,rubro:match.rubro});
 }
 return Object.freeze({
  estado:'interpretado_para_simulacion_sin_confirmar',
  reconocidos:Object.freeze(reconocidos),
  pendientes:Object.freeze(pendientes),
  avisos:Object.freeze(records.warnings),
  totalFilas:records.entries.filter(e=>e.descripcion.trim()).length
 });
}
export type ComercioDemoMvp069=Readonly<{
 id:'corralon_a'|'corralon_b';zona:string;
 catalogo:LecturaCatalogoMvp069;
}>;
export function simularConsultasCatalogosMvp069(args:{
 pedido:string;comercios:readonly ComercioDemoMvp069[];
}){
 if(!Array.isArray(args.comercios)||args.comercios.length!==2||
  args.comercios[0].id===args.comercios[1].id)fail();
 const pedido=prepararPedidoTextoMvp028(
  separarListaWhatsappNaturalMvp058(args.pedido));
 if(pedido.estado!=='listo_para_registrar'||!pedido.zonaEntrega)
  return {estado:'pedido_necesita_aclaracion' as const,
   pendientes:pedido.pendientes,invitaciones:[],sinProveedor:[],mensajesEnviados:0 as const};
 const invitaciones=args.comercios.map(c=>{
  const codes=new Set(c.catalogo.reconocidos.map((r:LineaCatalogoMvp069)=>r.producto_id));
  return {comercio:c.id,
   items:canon(c.zona)===canon(pedido.zonaEntrega!)?
    pedido.items.filter(i=>codes.has(i.product_code)):[]
  };
 }).filter(x=>x.items.length>0);
 const cubiertos=new Set(invitaciones.flatMap(c=>c.items.map(i=>i.product_code)));
 return {estado:'simulacion_cobertura_sin_envio' as const,
  pendientes:[],invitaciones,
  sinProveedor:pedido.items.filter(i=>!cubiertos.has(i.product_code)),
  mensajesEnviados:0 as const};
}
