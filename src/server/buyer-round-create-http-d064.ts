/**
 * MVP-015: create a buyer round with no extra "Confirmo".
 * Text/document extraction must happen BEFORE this call. This endpoint only
 * accepts a reviewed structured order with an explicit delivery zone.
 * The SQL RPC rechecks live Auth session and active company membership.
 */
import {rondasLecturaHabilitada,type ActorLectura} from './rondas-lectura-http.ts';
import {origenSeguro} from './portal-entorno.ts';

export type BuyerRoundInputD064=Readonly<{
 requestId:string;companyId?:string|null;deliveryZone:string;
 vatRequest:'no_especificado'|'con_iva'|'sin_iva'|'contradictorio';
 items:readonly Readonly<{line_no:number;product_code:string;
  quantity:string;unit:string;source_description?:string}>[];
}>;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const CODE=/^[a-z][a-z0-9_]{2,49}$/u;
const QTY=/^[1-9][0-9]{0,8}(?:\.[0-9]{1,3})?$/u;
const ZONE=/^[\p{L}\p{M}\d .,-]{3,65}$/u;
const VAT=new Set(['no_especificado','con_iva','sin_iva','contradictorio']);
const UNITS=new Set(['unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack']);
const FIELDS=['requestId','companyId','deliveryZone','vatRequest','items'];
const ITEM_FIELDS=['line_no','product_code','quantity','unit','source_description'];
const SOURCE=/^[\p{L}\p{M}\p{N} .,()/+²³-]{3,90}$/u;
const HDR={'content-type':'application/json; charset=utf-8',
 'cache-control':'private, no-store, no-cache, max-age=0, must-revalidate',
 'vary':'Cookie, Authorization','x-content-type-options':'nosniff'};
function reply(status:number,data:Record<string,unknown>):Response{
 return new Response(JSON.stringify(data),{status,headers:HDR});
}
function record(v:unknown):v is Record<string,unknown>{
 return typeof v==='object'&&v!==null&&!Array.isArray(v);
}
function exact(v:unknown,fields:readonly string[],optional:string[]=[]):v is Record<string,unknown>{
 return record(v)&&Object.keys(v).every(k=>fields.includes(k))&&
  fields.filter(k=>!optional.includes(k)).every(k=>Object.hasOwn(v,k));
}
function validate(input:unknown):input is BuyerRoundInputD064{
 if(!exact(input,FIELDS,['companyId'])||!UUID.test(String(input.requestId))||
  !(input.companyId===undefined||input.companyId===null||
    typeof input.companyId==='string'&&UUID.test(input.companyId))||
  typeof input.deliveryZone!=='string'||
  !ZONE.test(input.deliveryZone.trim())||
  typeof input.vatRequest!=='string'||!VAT.has(input.vatRequest)||
  !Array.isArray(input.items)||input.items.length<1||input.items.length>8)return false;
 const seen=new Set<string>();
 for(let i=0;i<input.items.length;i++){
  const line:unknown=input.items[i];
  if(!exact(line,ITEM_FIELDS,['source_description'])||
    line.line_no!==i+1||typeof line.product_code!=='string'||
    !CODE.test(line.product_code)||seen.has(line.product_code)||
    typeof line.quantity!=='string'||!QTY.test(line.quantity)||
    typeof line.unit!=='string'||!UNITS.has(line.unit)||
    (line.source_description!==undefined&&(
     typeof line.source_description!=='string'||
     !SOURCE.test(line.source_description)||
     line.source_description.trim()!==line.source_description||
     /https?:|www\.|\d{10,}/iu.test(line.source_description)
    )))return false;
  seen.add(line.product_code);
 }
 return true;
}
export function habilitarCreacionRondaD064(env:Record<string,string|undefined>):boolean{
 return rondasLecturaHabilitada(env)&&env.COTIRONDA_ROUNDS_CREATE_ENABLED==='true';
}
export async function procesarCreacionRondaD064(req:Request,deps:{
 habilitado:boolean;
 verificarSesion:()=>Promise<ActorLectura|null>;
 crear:(input:BuyerRoundInputD064)=>Promise<unknown>;
}):Promise<Response>{
 if(!deps.habilitado)return reply(503,{error:'solicitudes_no_habilitadas'});
 if(req.method!=='POST')return reply(405,{error:'metodo_no_permitido'});
 const origin=req.headers.get('origin');
 if(!origin||origin!==new URL(req.url).origin||
  req.headers.get('sec-fetch-site')==='cross-site')
  return reply(403,{error:'origen_no_autorizado'});
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(
  req.headers.get('content-type')??''))
  return reply(415,{error:'formato_no_permitido'});
 const lengthHeader=Number(req.headers.get('content-length')??'0');
 if(!Number.isSafeInteger(lengthHeader)||lengthHeader>4096||
    lengthHeader<0)return reply(413,{error:'pedido_demasiado_grande'});
 let body:unknown;
 try{
  const text=await req.text();
  if(text.length>4096||text.length===0)return reply(413,{error:'pedido_demasiado_grande'});
  body=JSON.parse(text);
 }catch{return reply(400,{error:'pedido_invalido'})}
 if(!validate(body))return reply(400,{error:'pedido_invalido'});
 let actor:ActorLectura|null;
 try{actor=await deps.verificarSesion()}catch{
  return reply(503,{error:'autenticacion_no_disponible'});
 }
 if(!actor||!UUID.test(actor.userId)||actor.anonimo||!actor.emailVerificado)
  return reply(401,{error:'sesion_no_valida'});
 try{
  const result=await deps.crear(body);
  if(!exact(result,['roundId','status','repeated'])||
    typeof result.roundId!=='string'||!UUID.test(result.roundId)||
    result.status!=='programada'||typeof result.repeated!=='boolean')
    throw Error('invalid_rpc_result');
  return reply(result.repeated?200:201,{
   roundId:result.roundId,status:'programada',repeated:result.repeated,
   // A round is saved, but NO invitation has been sent yet.
   invitationsSent:0
  });
 }catch{return reply(503,{error:'solicitud_no_disponible'})}
}
