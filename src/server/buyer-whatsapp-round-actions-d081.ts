/**
 * MVP-046 / D081 — two low-privilege, server-only SQL ports:
 * (1) persist buyer WhatsApp round + consume zone pending atomically;
 * (2) after COMMIT, prepare invites using existing D071.
 * No HTTP endpoint, Whapi request, SMS, or Supabase client is created here.
 */
import {crearPlanificadorRondaD071} from './whapi-round-planner-d071.ts';
import type {PuertoCompradorD073} from './buyer-whatsapp-ingress-d073.ts';

type Db=Readonly<{query:(sql:string,args:readonly unknown[])=>
 Promise<Readonly<{rows:readonly Record<string,unknown>[]}>>}>;
const SQL='select cotironda_private.whapi_create_buyer_round_d081($1::text,$2::text,$3::text,$4::text,$5::uuid,$6::text,$7::text,$8::jsonb,$9::integer) as payload';
const UUID=/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/iu;
const SHA=/^[a-f0-9]{64}$/u;
const CH=/^[A-Za-z0-9_-]{4,64}$/u;
const IVA=new Set(['no_especificado','con_iva','sin_iva']);
const UNITS=new Set(['unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack']);
function deny():never{throw Error('d081_round_unavailable')}
function obj(x:unknown):x is Record<string,unknown>{
 return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function exact(x:unknown,keys:readonly string[]):x is Record<string,unknown>{
 return obj(x)&&Object.keys(x).length===keys.length&&
  Object.keys(x).every(k=>keys.includes(k));
}
type Input=Parameters<PuertoCompradorD073['crearRonda']>[0];
function inputValid(v:unknown,channel:string):v is Input{
 if(!exact(v,['buyerOrgId','chatKey','channel','originMessageKey',
   'replyMessageKey','pedido'])||v.channel!==channel||
   typeof v.buyerOrgId!=='string'||!UUID.test(v.buyerOrgId)||
   typeof v.chatKey!=='string'||!SHA.test(v.chatKey)||
   typeof v.originMessageKey!=='string'||!SHA.test(v.originMessageKey)||
   typeof v.replyMessageKey!=='string'||!SHA.test(v.replyMessageKey)||
   !exact(v.pedido,['deliveryZone','vatRequest','items','plazoDias']))return false;
 const p=v.pedido;
 if(typeof p.deliveryZone!=='string'||
  p.deliveryZone.length<3||p.deliveryZone.length>65||
  !/^[\p{L}\p{M}0-9 .,-]+$/u.test(p.deliveryZone)||
  p.deliveryZone.trim()!==p.deliveryZone||
  typeof p.vatRequest!=='string'||!IVA.has(p.vatRequest)||
  typeof p.plazoDias!=='number'||!Number.isSafeInteger(p.plazoDias)||
  p.plazoDias<3||p.plazoDias>7||
  !Array.isArray(p.items)||p.items.length<1||p.items.length>8)return false;
 const seen=new Set<string>();
 return p.items.every((item,i)=>{
  if(!exact(item,['line_no','product_code','quantity','unit','source_description'])||
   item.line_no!==i+1||
   typeof item.product_code!=='string'||
   !/^[a-z][a-z0-9_]{2,49}$/u.test(item.product_code)||
   seen.has(item.product_code)||
   typeof item.quantity!=='string'||
   !/^[1-9][0-9]{0,8}(\.[0-9]{1,3})?$/u.test(item.quantity)||
   typeof item.unit!=='string'||!UNITS.has(item.unit)||
   typeof item.source_description!=='string'||
   item.source_description.length<3||item.source_description.length>90||
   /https?:|www\.|\d{10,}/iu.test(item.source_description))return false;
  seen.add(item.product_code);return true;
 });
}
export function crearAccionesRondaWhatsappD081(config:Readonly<{
 habilitado:boolean;channel:string;roundDb:Db;inviteDb:Db;
}>):Pick<PuertoCompradorD073,'crearRonda'|'prepararInvitaciones'>{
 if(!config||typeof config.habilitado!=='boolean'||!CH.test(config.channel)||
  !config.roundDb||typeof config.roundDb.query!=='function'||
  !config.inviteDb||typeof config.inviteDb.query!=='function')deny();
 const planner=crearPlanificadorRondaD071({
  habilitado:config.habilitado,channel:config.channel,
  committedRpc:async(sql,args)=>{
   const result=await config.inviteDb.query(sql,args);
   if(!obj(result)||!Array.isArray(result.rows)||result.rows.length!==1||
    !exact(result.rows[0],['payload']))deny();
   return result.rows[0];
  }
 });
 return Object.freeze({
  crearRonda:async(input)=>{
   if(!config.habilitado||!inputValid(input,config.channel))deny();
   let response:unknown;
   try{
    const result=await config.roundDb.query(SQL,[
     input.channel,input.chatKey,input.originMessageKey,input.replyMessageKey,
     input.buyerOrgId,input.pedido.deliveryZone,input.pedido.vatRequest,
     JSON.stringify(input.pedido.items),input.pedido.plazoDias
    ]);
    if(!obj(result)||!Array.isArray(result.rows)||result.rows.length!==1||
     !exact(result.rows[0],['payload']))deny();
    response=result.rows[0].payload;
   }catch{deny()}
   if(!exact(response,['roundId','repetida'])||
    typeof response.roundId!=='string'||!UUID.test(response.roundId)||
    typeof response.repetida!=='boolean')deny();
   return Object.freeze({roundId:response.roundId,repetida:response.repetida});
  },
  prepararInvitaciones:async(roundId)=>{
   if(typeof roundId!=='string'||!UUID.test(roundId))deny();
   try{
    const result=await planner.planificar({roundId});
    const allowed=['queued_without_sending','needs_verified_location',
     'needs_catalog_mapping','no_eligible_suppliers','desactivado'] as const;
    if(!allowed.some(x=>x===result.estado))deny();
    const estado=result.estado as typeof allowed[number];
    const nuevasInvitaciones='nuevasInvitaciones' in result?
     result.nuevasInvitaciones:undefined;
    if(nuevasInvitaciones!==undefined&&
     (typeof nuevasInvitaciones!=='number'||
      !Number.isSafeInteger(nuevasInvitaciones)||nuevasInvitaciones<0))deny();
    return Object.freeze({estado,mensajesEnviados:0 as const,
     ...(typeof nuevasInvitaciones==='number'?
      {nuevasInvitaciones}:{})});
   }catch{deny()}
  }
 } satisfies Pick<PuertoCompradorD073,'crearRonda'|'prepararInvitaciones'>);
}
