/**
 * P0 — server-only assembly, NOT an HTTP endpoint or a scheduled worker.
 * Requires a manually approved and enabled PILOT plus a restricted DB login.
 * No token, phone, private key, credentials or recipient embedded in source.
 */
import {crearRpcPostgresAvisosP0} from './whapi-terms-pg-driver-p0.ts';
import type {TermsPgFactoryP0} from './whapi-terms-pg-driver-p0.ts';
import {crearPuertosSqlAvisosCifradosP0}
 from './whapi-terms-sql-p0.ts';
import {crearEmisorAvisoTerminosP0}
 from './whapi-terms-onboarding-p0.ts';
import type {AvisoResultadoP0}
 from './whapi-terms-onboarding-p0.ts';

type Env=Readonly<Record<string,string|undefined>>;
export type RunnerConfigP0=Readonly<{
 habilitado:boolean;pilotoAutorizado:boolean;
 dbEnv:Env;loadPgFactory:()=>Promise<TermsPgFactoryP0>;
 channel:string;pilotHmacKey:Buffer;contactAesKey:Buffer;
 whapiToken?:string;fetcher?:typeof fetch;
 destinatariosPermitidos:readonly string[];
}>;
const DENIED='p0_runner_no_configurado';
/** Each call processes at most ONE claim and one outgoing message.
 * The caller is responsible for rate-limiting and deployment authorization.
 * This factory does NOT instantiate a cron, route, global fetch, or pool.
 */
export function crearEjecutorAvisosP0(config:RunnerConfigP0){
 if(!config||typeof config!=='object')
  throw Error(DENIED);
 async function procesarUno():Promise<AvisoResultadoP0>{
  if(config.habilitado!==true||config.pilotoAutorizado!==true)
   return {estado:'desactivado'};
  if(typeof config.loadPgFactory!=='function'||
     typeof config.fetcher!=='function'||
     typeof config.whapiToken!=='string'||
     !Array.isArray(config.destinatariosPermitidos)||
     config.destinatariosPermitidos.length===0)
   return {estado:'desactivado'};
  // Fail closed for pilot-disabled or cross-project DB BEFORE claiming work.
  const sql=crearRpcPostgresAvisosP0(config.dbEnv,config.loadPgFactory);
  const ports=crearPuertosSqlAvisosCifradosP0({
   committedRpc:sql.committedRpc,
   keys:{
    channel:config.channel,
    pilotHmacKey:config.pilotHmacKey,
    contactAesKey:config.contactAesKey
   }
  });
  return crearEmisorAvisoTerminosP0({
   habilitado:config.habilitado,pilotoAutorizado:config.pilotoAutorizado,
   channel:config.channel,token:config.whapiToken,
   pilotHmacKey:config.pilotHmacKey,fetcher:config.fetcher,
   destinatariosPermitidos:config.destinatariosPermitidos,
   ports
  }).procesarUno();
 }
 return Object.freeze({procesarUno});
}
