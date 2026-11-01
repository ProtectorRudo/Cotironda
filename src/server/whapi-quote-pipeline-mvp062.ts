/**
 * MVP-062: server-only supplier quote consumer. Reuses D062 queue,
 * D061 authenticated encrypted inbox, D063 cautious text interpretation
 * and D060 atomic versioned receipt. NO Whapi sends, AI or cron here.
 */
import {crearWorkerCotizacionesD062} from './whapi-quote-worker-d062.ts';
import {crearRecepcionDirectaDeInboxD061} from './whapi-quote-inbox-processor-d061.ts';
import {interpretarCotizacionSimpleD063}
 from './whapi-quote-simple-interpreter-d063.ts';
import type {VerificadorCifradoD061}
 from './whapi-quote-inbox-processor-d061.ts';
import type {DbRecepcionD059} from './whapi-quote-direct-postgres-d059.ts';

export type PuertosCotizadorMvp062=Readonly<{
 cola:DbRecepcionD059;lectura:DbRecepcionD059;escritura:DbRecepcionD059;
}>;
const SQL={
 cola:new Map([
  ['select cotironda_private.whapi_claim_quote_d062() as payload',0],
  ['select cotironda_private.whapi_finish_quote_d062($1::text,$2::text,$3::uuid,$4::text) as payload',4]
 ]),
 lectura:new Map([
  ['select cotironda_private.whapi_quote_read_d061($1::text,$2::text) as payload',2]
 ]),
 escritura:new Map([
  ['select cotironda_private.whapi_receive_with_prices_d060($1::text,$2::text,$3::integer,$4::jsonb,$5::jsonb) as payload',5],
  ['select cotironda_private.whapi_receive_with_original_d093($1::text,$2::text,$3::integer,$4::jsonb,$5::jsonb,$6::jsonb) as payload',6]
 ])
} as const;
function deny():never{throw Error('mvp062_cotizador_privado_no_disponible')}
function narrowed(db:DbRecepcionD059,allowed:ReadonlyMap<string,number>):DbRecepcionD059{
 if(!db||typeof db.query!=='function')deny();
 return Object.freeze({query:async(sql:string,args:readonly unknown[])=>{
  if(!allowed.has(sql)||!Array.isArray(args)||allowed.get(sql)!==args.length)deny();
  try{
   const answer=await db.query(sql,args);
   if(!answer||!Array.isArray(answer.rows))deny();
   return answer;
  }catch{deny()}
 }});
}
export function crearProcesadorCotizacionesMvp062(config:Readonly<{
 habilitado:boolean;puertos:PuertosCotizadorMvp062;
 verificar:VerificadorCifradoD061;
 exigirOriginalIntegral?:boolean;
}>){
 if(!config||typeof config.habilitado!=='boolean'||
   !config.puertos||typeof config.verificar!=='function')deny();
 const cola=narrowed(config.puertos.cola,SQL.cola);
 const lectura=narrowed(config.puertos.lectura,SQL.lectura);
 const escritura=narrowed(config.puertos.escritura,SQL.escritura);
 if(!config.habilitado)return Object.freeze({
  procesarUno:async()=>Object.freeze({estado:'desactivado' as const}),
  procesarLote:async()=>Object.freeze({estado:'desactivado' as const})
 });
 const joined:DbRecepcionD059={query:async(sql,args)=>{
  if(SQL.lectura.has(sql))return lectura.query(sql,args);
  if(SQL.escritura.has(sql))return escritura.query(sql,args);
  deny();
 }};
 const inbound=crearRecepcionDirectaDeInboxD061(
  joined,config.verificar,interpretarCotizacionSimpleD063,
  config.exigirOriginalIntegral===true);
 return crearWorkerCotizacionesD062(cola,inbound);
}
