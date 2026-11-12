/**
 * P0 — isolated, single-operation PostgreSQL driver for outbound terms notice.
 * No route, cron or send is wired here. Requires an injected postgres.js
 * factory and a dedicated, non-admin LOGIN not shared with other services.
 * Each SQL RPC opens one TLS physical connection, verifies session identity,
 * executes one parameterized allowlisted SELECT and closes it.
 * No D088 (different project), anon, service_role or pooler port 6543.
 */
type Env=Readonly<Record<string,string|undefined>>;
type Row=Record<string,unknown>;
type ReservedConnection=Readonly<{
 unsafe:(sql:string,params?:readonly unknown[])=>Promise<readonly Row[]>;
 release:()=>Promise<void>;
}>;
type SqlSession=Readonly<{
 reserve:()=>Promise<ReservedConnection>;
 end:(options?:Readonly<{timeout:number}>)=>Promise<void>;
}>;
export type TermsPgFactoryP0=(
 url:string,
 options:Readonly<{
  max:1;max_pipeline:1;prepare:false;fetch_types:false;
  connect_timeout:5;idle_timeout:5;
  ssl:Readonly<{ca:string;rejectUnauthorized:true}>;
 }>
)=>SqlSession;
const REF='ilggkalaafhtiysyzlmg';
const LOGIN='cotironda_terms_sender_login_p0';
const ROLE='cotironda_pilot_terms_sender_p0';
const IDENT='select session_user as login, current_user as rol';
const SET_ROLE='set role cotironda_pilot_terms_sender_p0';
const COMMANDS=new Map<string,number>([
 ['select cotironda_piloto_privado.terms_claim_p0() as payload',0],
 ['select cotironda_piloto_privado.terms_begin_p0($1::uuid,$2::uuid) as payload',2],
 ['select cotironda_piloto_privado.terms_authorize_p0($1::uuid,$2::uuid,$3::text) as payload',3],
 ['select cotironda_piloto_privado.terms_finish_p0($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text) as payload',8],
 ['select cotironda_piloto_privado.terms_recipient_packet_p0($1::uuid,$2::uuid) as payload',2],
]);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const SHA=/^[a-f0-9]{64}$/u;
function invalid():never{throw Error('p0_terms_pg_no_disponible')}
function exact(v:unknown,keys:readonly string[]):v is Row{
 return v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).length===keys.length&&
  Object.keys(v).every(x=>keys.includes(x));
}
function identity(rows:unknown,login:string,role:string):boolean{
 return Array.isArray(rows)&&rows.length===1&&
   exact(rows[0],['login','rol'])&&
   rows[0].login===login&&rows[0].rol===role;
}
function argsAllowed(sql:string,params:readonly unknown[]):boolean{
 if(!COMMANDS.has(sql)||params.length!==COMMANDS.get(sql))return false;
 if(sql.includes('terms_claim_p0'))return true;
 if(typeof params[0]!=='string'||!UUID.test(params[0]))return false;
 if(typeof params[1]!=='string'||!UUID.test(params[1]))return false;
 if(sql.includes('terms_authorize_p0'))
  return typeof params[2]==='string'&&SHA.test(params[2]);
 if(sql.includes('terms_finish_p0'))
  return typeof params[2]==='string'&&/^[a-z][a-z0-9_]{2,63}$/u.test(params[2])&&
   params[3]==='cotironda-originales-alta-v1'&&
   typeof params[4]==='string'&&SHA.test(params[4])&&
   ['api_accepted','uncertain'].includes(String(params[5]))&&
   (params[6]===null||(typeof params[6]==='string'&&SHA.test(params[6])))&&
   typeof params[7]==='string'&&SHA.test(params[7]);
 return true;
}
export function validarConexionAvisosP0(env:Env):Readonly<{url:string;ca:string}>{
 if(!env||env.COTIRONDA_P0_TERMS_DB_DRIVER_ENABLED!=='true'||
    env.COTIRONDA_P0_TERMS_PILOT_AUTHORIZED!=='true'||
    env.VERCEL_ENV!=='preview'||
    env.COTIRONDA_P0_TERMS_PROJECT_REF!==REF)invalid();
 const raw=env.COTIRONDA_P0_TERMS_DB_URL;
 const ca=env.COTIRONDA_P0_TERMS_DB_ROOT_CA_PEM;
 if(typeof raw!=='string'||raw.length>1400||
    typeof ca!=='string'||ca.length<200||ca.length>10000||
    !ca.startsWith('-----BEGIN CERTIFICATE-----')||
    !ca.trimEnd().endsWith('-----END CERTIFICATE-----'))invalid();
 let url:URL;
 try{url=new URL(raw)}catch{invalid()}
 if(!['postgres:','postgresql:'].includes(url.protocol)||
    url.hostname!=='db.'+REF+'.supabase.co'||url.port!=='5432'||
    url.pathname!=='/postgres'||url.hash!==''||url.search!==''||
    url.username!==LOGIN||!url.password||
    decodeURIComponent(url.password).length<24)invalid();
 return Object.freeze({url:raw,ca});
}
/** No global credential lookup; factory loaded only by a trusted backend. */
export function crearRpcPostgresAvisosP0(
 env:Env,loadFactory:()=>Promise<TermsPgFactoryP0>
):Readonly<{committedRpc:(sql:string,params:readonly unknown[])=>Promise<unknown>}>{
 const config=validarConexionAvisosP0(env);
 if(typeof loadFactory!=='function')invalid();
 async function committedRpc(sql:string,params:readonly unknown[]):Promise<unknown>{
  if(typeof sql!=='string'||!Array.isArray(params)||
     !argsAllowed(sql,params))invalid();
  let conn:SqlSession|undefined,reserved:ReservedConnection|undefined;
  let result:unknown,failed=false;
  try{
   const factory=await loadFactory();
   if(typeof factory!=='function')invalid();
   conn=factory(config.url,{
    max:1,max_pipeline:1,prepare:false,fetch_types:false,
    connect_timeout:5,idle_timeout:5,
    ssl:{ca:config.ca,rejectUnauthorized:true}
   });
   if(!conn||typeof conn.reserve!=='function'||
      typeof conn.end!=='function')invalid();
   reserved=await conn.reserve();
   if(!reserved||typeof reserved.unsafe!=='function'||
      typeof reserved.release!=='function')invalid();
   if(!identity(await reserved.unsafe(IDENT,[]),LOGIN,LOGIN))invalid();
   await reserved.unsafe(SET_ROLE,[]);
   if(!identity(await reserved.unsafe(IDENT,[]),LOGIN,ROLE))invalid();
   const rows=await reserved.unsafe(sql,params);
   if(!Array.isArray(rows)||rows.length!==1||
      !exact(rows[0],['payload']))invalid();
   result=rows[0];
  }catch{failed=true}
  // A lost COMMIT ACK or failed shutdown is not a confirmed safe result.
  if(reserved){try{await reserved.release()}catch{failed=true}}
  if(conn){try{await conn.end({timeout:3})}catch{failed=true}}
  if(failed)invalid();
  return result;
 }
 return Object.freeze({committedRpc});
}
