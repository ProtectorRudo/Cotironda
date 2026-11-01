/**
 * MVP-057 / D088 — Whapi HTTPS Preview private Postgres connector.
 * No Whapi API, no send, no buyer identity from HTTP.
 *
 * Postgres.js 3.4.9 is loaded ONLY after D083 authenticates the callback.
 * One reserved session per HTTPS request, never transaction pooler port 6543.
 * D085 then validates technical LOGIN / SET ROLE and limits SQL to six RPCs.
 */
import {abrirPuertoPostgresWhapiD085} from './whapi-sql-session-d085.ts';
import type {ClientePostgresD085} from './whapi-sql-session-d085.ts';
import type {PuertoPostgresD030} from './whapi-postgres-gateway.ts';

type Env=Readonly<Record<string,string|undefined>>;
type SQLRows=readonly Record<string,unknown>[];
type ReservedConnection=Readonly<{
 unsafe:(sql:string,params?:readonly unknown[])=>Promise<SQLRows>;
 release:()=>Promise<void>;
}>;
type SessionSQL=Readonly<{
 reserve:()=>Promise<ReservedConnection>;
 end:(options?:Readonly<{timeout:number}>)=>Promise<void>;
}>;
export type PostgresFactoryD088=(
 url:string,
 options:Readonly<{
  max:1;max_pipeline:1;prepare:false;fetch_types:false;
  connect_timeout:5;idle_timeout:5;
  ssl:Readonly<{ca:string;rejectUnauthorized:true}>;
 }>
)=>SessionSQL;

const DEV_REF='qkercsoqhehbenbbncwk';
const LOGIN='cotironda_whapi_http_login_d085';
function unavailable():never{throw Error('whapi_sql_privado_no_disponible')}

/**
 * Fail closed on any other project, login, plaintext connection, transaction
 * pooler, IP/custom host, URI query-string, missing CA or missing opt-in.
 * Never echo credential-bearing URLs in errors or logs.
 */
export function validarConexionWhapiD088(env:Env):Readonly<{
 url:string;ca:string;
}>{
 if(!env||env.COTIRONDA_WHAPI_DB_DRIVER_ENABLED!=='true'||
    env.VERCEL_ENV!=='preview'||
    env.VERCEL_GIT_COMMIT_REF!=='integration/mvp-piloto-20261031'||
    env.COTIRONDA_WHAPI_DB_PROJECT_REF!==DEV_REF)unavailable();
 const raw=env.COTIRONDA_WHAPI_DB_URL;
 const ca=env.COTIRONDA_WHAPI_DB_ROOT_CA_PEM;
 if(typeof raw!=='string'||raw.length>1500||
    typeof ca!=='string'||ca.length<200||ca.length>10000||
    !ca.startsWith('-----BEGIN CERTIFICATE-----')||
    !ca.trimEnd().endsWith('-----END CERTIFICATE-----'))unavailable();
 let parsed:URL;
 try{parsed=new URL(raw)}catch{unavailable()}
 if(!['postgres:','postgresql:'].includes(parsed.protocol)||
   parsed.port!=='5432'||parsed.pathname!=='/postgres'||
   parsed.hash!==''||parsed.search!==''||
   !parsed.password||decodeURIComponent(parsed.password).length<24)
   unavailable();
 const isDirect=parsed.hostname===`db.${DEV_REF}.supabase.co`;
 const isPooler=/^aws-[0-9]+-sa-east-1\.pooler\.supabase\.com$/u
  .test(parsed.hostname);
 if((!isDirect&&!isPooler)||
    decodeURIComponent(parsed.username)!==
      (isDirect?LOGIN:`${LOGIN}.${DEV_REF}`))unavailable();
 return Object.freeze({url:raw,ca});
}

function makeClient(connection:SessionSQL):ClientePostgresD085{
 let reserved:ReservedConnection|undefined;
 let closed=false;
 return Object.freeze({
  connect:async()=>{
   if(closed||reserved)unavailable();
   reserved=await connection.reserve();
   if(!reserved||typeof reserved.unsafe!=='function'||
      typeof reserved.release!=='function')unavailable();
  },
  query:async(sql:string,params:readonly unknown[]=[])=>{
   if(closed||!reserved||!Array.isArray(params))unavailable();
   const rows=await reserved.unsafe(sql,params);
   if(!Array.isArray(rows))unavailable();
   return {rows:Array.from(rows)};
  },
  end:async()=>{
   if(closed)return;
   closed=true;
   let failed=false;
   if(reserved){
    try{await reserved.release()}catch{failed=true}
   }
   try{await connection.end({timeout:3})}catch{failed=true}
   if(failed)unavailable();
  }
 });
}

/**
 * Called by D083 strictly AFTER HTTPS secret and size/content-type checks.
 * A real caller must supply the versioned Postgres.js factory via a dynamic
 * import performed by the server route (never browser-supplied).
 */
export async function abrirPuertoWhapiPreviewD088(
 env:Env,loadFactory:()=>Promise<PostgresFactoryD088>
):Promise<PuertoPostgresD030>{
 const {url,ca}=validarConexionWhapiD088(env);
 if(typeof loadFactory!=='function')unavailable();
 let factory:PostgresFactoryD088;
 try{factory=await loadFactory()}catch{unavailable()}
 if(typeof factory!=='function')unavailable();
 let connection:SessionSQL;
 try{connection=factory(url,{
  max:1,max_pipeline:1,prepare:false,fetch_types:false,
  connect_timeout:5,idle_timeout:5,
  ssl:{ca,rejectUnauthorized:true}
 })}catch{unavailable()}
 if(!connection||typeof connection.reserve!=='function'||
    typeof connection.end!=='function')unavailable();
 // D085 closes the dedicated driver on ALL initial identity failures.
 return abrirPuertoPostgresWhapiD085(()=>makeClient(connection));
}
