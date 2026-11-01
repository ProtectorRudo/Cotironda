/**
 * MVP-059: composition of ALREADY EXISTING buyer WhatsApp SQL contracts.
 *
 * D083 stores an authenticated encrypted inbox event (D074), whose DB trigger
 * queues D082. The worker leases D082, reads and decrypts D077 (including an
 * existing missing-location conversation), commits D081 and asks D071 to
 * atomically plan invitations by confirmed catalog+delivery zone.
 *
 * This module opens NO database/HTTP connection, calls NO AI, creates NO
 * schedules and sends NO WhatsApp. Every operation is injected as a separate
 * low-privilege PostgreSQL role port; fail closed on any SQL other than its
 * one/two exact allowlisted parameterized RPCs.
 */
import {crearWorkerPedidosWhatsappD082} from './buyer-whatsapp-queue-worker-d082.ts';
import {crearLectorCompradorConZonaD077} from './buyer-whatsapp-zone-conversation-d077.ts';
import {crearAccionesRondaWhatsappD081} from './buyer-whatsapp-round-actions-d081.ts';
import type {EntradaCifradaCompradorMvp042} from './whapi-crypto-broker.ts';

type Result=Readonly<{rows:readonly Record<string,unknown>[]}>;
export type PuertoSqlCompradorMvp059=Readonly<{
 query:(sql:string,args:readonly unknown[])=>Promise<Result>;
}>;
export type PuertosSqlCompradorMvp059=Readonly<{
 cola:PuertoSqlCompradorMvp059;
 lectura:PuertoSqlCompradorMvp059;
 zona:PuertoSqlCompradorMvp059;
 ronda:PuertoSqlCompradorMvp059;
 invitacion:PuertoSqlCompradorMvp059;
}>;
type Decoded=Readonly<{
 tipo:'text'|'image'|'document'|'audio'|'voice';
 texto:string|null;marcaTiempoUnix:number;
}>;
const CH=/^[A-Za-z0-9_-]{4,64}$/u;
const RULES={
 cola:new Map([
  ['select cotironda_private.whapi_claim_buyer_d082($1::text) as payload',1],
  ['select cotironda_private.whapi_finish_buyer_d082($1::text,$2::text,$3::uuid,$4::text) as payload',4]
 ]),
 lectura:new Map([
  ['select cotironda_private.whapi_zone_context_d077($1::text,$2::text) as payload',2]
 ]),
 zona:new Map([
  ['select cotironda_private.whapi_zone_enqueue_d077($1::text,$2::text,$3::text,$4::uuid) as payload',4]
 ]),
 ronda:new Map([
  ['select cotironda_private.whapi_create_buyer_round_d081($1::text,$2::text,$3::text,$4::text,$5::uuid,$6::text,$7::text,$8::jsonb,$9::integer) as payload',9]
 ]),
 invitacion:new Map([
  ['select cotironda_private.whapi_prepare_commercial_round_d071($1::uuid,$2::text) as payload',2]
 ])
} as const;
function fail():never{throw Error('mvp059_worker_privado_no_disponible')}
function narrow(
 port:PuertoSqlCompradorMvp059,
 allowed:ReadonlyMap<string,number>
):PuertoSqlCompradorMvp059{
 if(!port||typeof port.query!=='function')fail();
 return Object.freeze({
  query:async(sql:string,args:readonly unknown[]):Promise<Result>=>{
   if(typeof sql!=='string'||!Array.isArray(args)||
     !allowed.has(sql)||args.length!==allowed.get(sql))fail();
   try{return await port.query(sql,args)}catch{fail()}
  }
 });
}
export function crearRecorridoCompradorWhatsAppMvp059(config:Readonly<{
 habilitado:boolean;
 canal:string;
 sql:PuertosSqlCompradorMvp059;
 verificarContenidoComprador:
  (encrypted:EntradaCifradaCompradorMvp042)=>Decoded;
}>){
 if(!config||typeof config.habilitado!=='boolean'||
  typeof config.canal!=='string'||!CH.test(config.canal)||
  !config.sql||typeof config.verificarContenidoComprador!=='function')fail();
 const cola=narrow(config.sql.cola,RULES.cola);
 const lectura=narrow(config.sql.lectura,RULES.lectura);
 const zona=narrow(config.sql.zona,RULES.zona);
 const ronda=narrow(config.sql.ronda,RULES.ronda);
 const invitacion=narrow(config.sql.invitacion,RULES.invitacion);
 const acciones=crearAccionesRondaWhatsappD081({
  habilitado:config.habilitado,channel:config.canal,
  roundDb:ronda,inviteDb:invitacion
 });
 const handler=crearLectorCompradorConZonaD077({
  habilitado:config.habilitado,channel:config.canal,
  readDb:lectura,zoneDb:zona,
  verificarComprador:config.verificarContenidoComprador,
  acciones
 });
 return crearWorkerPedidosWhatsappD082({
  habilitado:config.habilitado,channel:config.canal,
  db:cola,handler
 });
}
