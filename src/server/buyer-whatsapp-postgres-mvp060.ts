/**
 * MVP-060 — Five isolated, RESERVED PostgreSQL sessions for buyer jobs.
 * Dedicated login per role, not postgres/admin/service_role, no shared
 * transaction-pooler, no SQL beyond MVP059's fixed RPC allowlists.
 * NO network in this source except through the injected Postgres.js factory.
 */
import {construirBrokerWhapiPrivado} from './whapi-crypto-broker.ts';
import type {PostgresFactoryD088} from './whapi-postgres-driver-d088.ts';
import type {RecursosWorkerMvp060} from './buyer-whatsapp-runner-http-mvp060.ts';
import type {PuertosSqlCompradorMvp059,
 PuertoSqlCompradorMvp059} from './buyer-whatsapp-pipeline-mvp059.ts';

type Env=Readonly<Record<string,string|undefined>>;
type Port='cola'|'lectura'|'zona'|'ronda'|'invitacion';
type Session=ReturnType<PostgresFactoryD088>;
type Reserved=Awaited<ReturnType<Session['reserve']>>;
const REF='qkercsoqhehbenbbncwk';
const CH=/^[A-Za-z0-9_-]{4,64}$/u;
const KEY=/^[a-z][a-z0-9_]{2,40}$/u;
const HEX=/^[a-f0-9]{64}$/u;
const PORTS=Object.freeze({
 cola:['cotironda_buyer_worker_cola_login_d090',
  'cotironda_buyer_queue_gateway_d082'],
 lectura:['cotironda_buyer_worker_lectura_login_d090',
  'cotironda_buyer_gateway_d076'],
 zona:['cotironda_buyer_worker_zona_login_d090',
  'cotironda_buyer_zone_gateway_d077'],
 ronda:['cotironda_buyer_worker_ronda_login_d090',
  'cotironda_whapi_round_gateway_d081'],
 invitacion:['cotironda_buyer_worker_invite_login_d090',
  'cotironda_invite_gateway_d070']
} as const);
const KEYS=Object.freeze({
 cola:'COTIRONDA_BUYER_DB_URL_COLA',
 lectura:'COTIRONDA_BUYER_DB_URL_LECTURA',
 zona:'COTIRONDA_BUYER_DB_URL_ZONA',
 ronda:'COTIRONDA_BUYER_DB_URL_RONDA',
 invitacion:'COTIRONDA_BUYER_DB_URL_INVITACION'
} as const);
const IDENT='select session_user as login, current_user as rol';
function fail():never{throw Error('buyer_worker_sql_no_disponible')}
function key(raw:unknown):Buffer{
 if(typeof raw!=='string'||!HEX.test(raw))fail();
 const b=Buffer.from(raw,'hex');
 if(b.every(x=>x===0))fail();
 return b;
}
function validate(url:string,login:string):void{
 if(typeof url!=='string'||url.length>1500)fail();
 let p:URL;
 try{p=new URL(url)}catch{fail()}
 if(!['postgres:','postgresql:'].includes(p.protocol)||
    p.port!=='5432'||p.pathname!=='/postgres'||
    p.search!==''||p.hash!==''||!p.password)fail();
 const direct=p.hostname===`db.${REF}.supabase.co`;
 const pooler=/^aws-[0-9]+-sa-east-1\.pooler\.supabase\.com$/u.test(p.hostname);
 if(!direct&&!pooler)fail();
 try{
  if(decodeURIComponent(p.username)!==(direct?login:`${login}.${REF}`)||
     decodeURIComponent(p.password).length<24)fail();
 }catch{fail()}
}
function checkedIdentity(raw:unknown,login:string,role:string):boolean{
 return Array.isArray(raw)&&raw.length===1&&
  raw[0]!==null&&typeof raw[0]==='object'&&
  Object.keys(raw[0]).length===2&&
  raw[0].login===login&&raw[0].rol===role;
}
export async function abrirRecursosSqlCompradorMvp060(
 env:Env,factory:PostgresFactoryD088
):Promise<RecursosWorkerMvp060>{
 if(!env||env.VERCEL_ENV!=='preview'||
   env.VERCEL_GIT_COMMIT_REF!=='integration/mvp-piloto-20261031'||
   env.COTIRONDA_BUYER_WORKER_ENABLED!=='true'||
   env.COTIRONDA_BUYER_WORKER_PILOT_AUTHORIZED!=='true'||
   env.COTIRONDA_BUYER_WORKER_DB_DRIVER_ENABLED!=='true'||
   env.COTIRONDA_REGISTRATION_ENABLED==='true'||
   env.COTIRONDA_BUYER_WORKER_DB_PROJECT_REF!==REF||
   !CH.test(env.COTIRONDA_WHAPI_CHANNEL??'')||
   typeof factory!=='function')fail();
 const ca=env.COTIRONDA_BUYER_WORKER_DB_ROOT_CA_PEM;
 if(typeof ca!=='string'||ca.length<200||ca.length>10000||
    !ca.startsWith('-----BEGIN CERTIFICATE-----')||
    !ca.trimEnd().endsWith('-----END CERTIFICATE-----'))fail();
 const idKey=key(env.COTIRONDA_WHAPI_HMAC_ID_HEX);
 const fpKey=key(env.COTIRONDA_WHAPI_HMAC_FINGERPRINT_HEX);
 const aesKey=key(env.COTIRONDA_WHAPI_AES_CONTENT_HEX);
 if(idKey.equals(fpKey)||idKey.equals(aesKey)||fpKey.equals(aesKey))fail();
 const keyId=env.COTIRONDA_WHAPI_AES_KEY_ID;
 const webhookSecret=env.COTIRONDA_WHAPI_WEBHOOK_SECRET;
 if(typeof keyId!=='string'||!KEY.test(keyId)||
  keyId==='legacy_d029'||typeof webhookSecret!=='string'||
  webhookSecret.length<32||webhookSecret.length>256)fail();
 // Validate ALL credentials before opening the first connection.
 const credentials={} as Record<Port,string>;
 for(const port of Object.keys(PORTS) as Port[]){
  const value=env[KEYS[port]];
  if(typeof value!=='string')fail();
  validate(value,PORTS[port][0]);
  credentials[port]=value;
 }
 const opened:({client:Session;reserved:Reserved}|{client:Session})[]=[];
 let closed=false;
 async function close(){
  if(closed)return;
  closed=true;
  for(const item of opened.reverse()){
   if('reserved' in item){
    try{await item.reserved.release()}catch{/* no PII in logs */}
   }
   try{await item.client.end({timeout:3})}catch{/* closed */ }
  }
 }
 const ports={} as Record<Port,PuertoSqlCompradorMvp059>;
 try{
  for(const port of Object.keys(PORTS) as Port[]){
   const [login,role]=PORTS[port];
   const client=factory(credentials[port],{
    max:1,max_pipeline:1,prepare:false,fetch_types:false,
    connect_timeout:5,idle_timeout:5,
    ssl:{ca,rejectUnauthorized:true}
   });
   if(!client||typeof client.reserve!=='function'||
      typeof client.end!=='function')fail();
   const owned:{client:Session;reserved?:Reserved}={client};
   opened.push(owned);
   const reserved=await client.reserve();
   if(!reserved||typeof reserved.unsafe!=='function'||
      typeof reserved.release!=='function')fail();
   owned.reserved=reserved;
   if(!checkedIdentity(await reserved.unsafe(IDENT,[]),login,login))fail();
   await reserved.unsafe(`set role ${role}`,[]);
   if(!checkedIdentity(await reserved.unsafe(IDENT,[]),login,role))fail();
   ports[port]=Object.freeze({
    query:async(sql:string,params:readonly unknown[])=>{
     if(closed||typeof sql!=='string'||!Array.isArray(params))fail();
     try{
      const rows=await reserved.unsafe(sql,params);
      if(!Array.isArray(rows))fail();
      return {rows:Array.from(rows)};
     }catch{fail()}
    }
   });
  }
  // Build the existing AAD + AES-GCM verifier. Its storage dependencies are
  // deliberately closed; the worker cannot write to D028/D074 through it.
  const broker=construirBrokerWhapiPrivado({
   channel:env.COTIRONDA_WHAPI_CHANNEL!,
   secretoWebhook:webhookSecret,
   habilitado:false,
   ahoraUnix:()=>Math.floor(Date.now()/1000),
   contenidoKeyId:keyId,
   claves:{identidadHmac:idKey,huellaHmac:fpKey,contenidoAes:aesKey},
   almacen:{
    resolverVinculo:async()=>fail(),
    registrarEntrada:async()=>fail(),
    registrarBaja:async()=>fail()
   }
  });
  return Object.freeze({
   sql:ports as PuertosSqlCompradorMvp059,
   verificarContenidoComprador:broker.verificarContenidoComprador,
   cerrar:close
  });
 }catch{
  await close();
  fail();
 }
}
