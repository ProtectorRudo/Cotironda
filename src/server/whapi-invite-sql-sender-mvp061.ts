/**
 * MVP-061: private SQL port ONLY for existing D070 invitation sender.
 * One NEW reserved PostgreSQL session PER RPC, no explicit transaction:
 * PostgreSQL commits D070 begin_invite BEFORE D055 Whapi HTTP.
 * SQL identities/role/host are checked on every invocation. NO network
 * fetch/Whapi token here, and no Admin/service_role connection.
 */
import type {PostgresFactoryD088} from './whapi-postgres-driver-d088.ts';
type Env=Readonly<Record<string,string|undefined>>;
type Session=ReturnType<PostgresFactoryD088>;
const REF='qkercsoqhehbenbbncwk';
const LOGIN='cotironda_invite_sender_login_d091';
const ROLE='cotironda_invite_sender_gateway_d091';
const IDENT='select session_user as login, current_user as rol';
const SET_ROLE='set role cotironda_invite_sender_gateway_d091';
const ALLOWED=new Map<string,number>([
 ['select cotironda_private.whapi_claim_invite_d070() as payload',0],
 ['select cotironda_private.whapi_fail_preflight_invite_d070($1::uuid,$2::uuid) as payload',2],
 ['select cotironda_private.whapi_begin_invite_d070($1::uuid,$2::uuid) as payload',2],
 ['select cotironda_private.whapi_authorize_invite_d070($1::uuid,$2::text,$3::text) as payload',3],
 ['select cotironda_private.whapi_finish_invite_d070($1::uuid,$2::uuid,$3::text,$4::text) as payload',4],
 ['select cotironda_private.whapi_read_recipient_packet_d068($1::uuid,$2::uuid,$3::text,$4::text) as payload',4]
]);
function deny():never{throw Error('mvp061_sql_sender_no_disponible')}
function validIdentity(rows:unknown,role:string):boolean{
 return Array.isArray(rows)&&rows.length===1&&
  rows[0]!==null&&typeof rows[0]==='object'&&
  Object.keys(rows[0]).length===2&&
  rows[0].login===LOGIN&&rows[0].rol===role;
}
export function validarSqlSenderMvp061(env:Env):Readonly<{url:string;ca:string}>{
 if(!env||env.VERCEL_ENV!=='preview'||
  env.VERCEL_GIT_COMMIT_REF!=='integration/mvp-piloto-20261031'||
  env.COTIRONDA_REGISTRATION_ENABLED==='true'||
  env.COTIRONDA_INVITE_SEND_ENABLED!=='true'||
  env.COTIRONDA_INVITE_SEND_PILOT_AUTHORIZED!=='true'||
  env.COTIRONDA_INVITE_SEND_DB_DRIVER_ENABLED!=='true'||
  env.COTIRONDA_INVITE_SEND_DB_PROJECT_REF!==REF)deny();
 const url=env.COTIRONDA_INVITE_SEND_DB_URL;
 const ca=env.COTIRONDA_INVITE_SEND_DB_CA_PEM;
 if(typeof url!=='string'||url.length>1500||
  typeof ca!=='string'||ca.length<200||ca.length>10000||
  !ca.startsWith('-----BEGIN CERTIFICATE-----')||
  !ca.trimEnd().endsWith('-----END CERTIFICATE-----'))deny();
 let parsed:URL;
 try{parsed=new URL(url)}catch{deny()}
 if(!['postgres:','postgresql:'].includes(parsed.protocol)||
   parsed.port!=='5432'||parsed.pathname!=='/postgres'||
   parsed.search!==''||parsed.hash!==''||!parsed.password)deny();
 const direct=parsed.hostname===`db.${REF}.supabase.co`;
 const pooler=/^aws-[0-9]+-sa-east-1\.pooler\.supabase\.com$/u
  .test(parsed.hostname);
 if(!direct&&!pooler)deny();
 try{
  if(decodeURIComponent(parsed.username)!==
    (direct?LOGIN:`${LOGIN}.${REF}`)||
    decodeURIComponent(parsed.password).length<24)deny();
 }catch{deny()}
 return Object.freeze({url,ca});
}
export function crearSqlEmisorInvitacionesMvp061(
 env:Env,factory:PostgresFactoryD088
):Readonly<{committedRpc:(sql:string,args:readonly unknown[])=>Promise<unknown>}>{
 const {url,ca}=validarSqlSenderMvp061(env);
 if(typeof factory!=='function')deny();
 return Object.freeze({committedRpc:async(sql:string,args:readonly unknown[])=>{
  if(!ALLOWED.has(sql)||!Array.isArray(args)||
    args.length!==ALLOWED.get(sql))deny();
  let connection:Session|undefined;
  let reserved:Awaited<ReturnType<Session['reserve']>>|undefined;
  try{
   connection=factory(url,{
    max:1,max_pipeline:1,prepare:false,fetch_types:false,
    connect_timeout:5,idle_timeout:5,
    ssl:{ca,rejectUnauthorized:true}
   });
   if(!connection||typeof connection.reserve!=='function'||
      typeof connection.end!=='function')deny();
   reserved=await connection.reserve();
   if(!reserved||typeof reserved.unsafe!=='function'||
      typeof reserved.release!=='function')deny();
   if(!validIdentity(await reserved.unsafe(IDENT,[]),LOGIN))deny();
   await reserved.unsafe(SET_ROLE,[]);
   if(!validIdentity(await reserved.unsafe(IDENT,[]),ROLE))deny();
   const rows=await reserved.unsafe(sql,args);
   if(!Array.isArray(rows)||rows.length!==1||
      rows[0]===null||typeof rows[0]!=='object'||
      Object.keys(rows[0]).length!==1||!('payload' in rows[0]))deny();
   return {payload:rows[0].payload};
  }catch{deny()}
  finally{
   try{await reserved?.release()}catch{/* never log PII */}
   try{await connection?.end({timeout:3})}catch{/* best effort close */}
  }
 }});
}
