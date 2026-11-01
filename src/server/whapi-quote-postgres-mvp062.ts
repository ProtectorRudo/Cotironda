/**
 * MVP-062: three dedicated SQL sessions for supplier quote processing.
 * Each session has ONE role, TLS/CA, and a narrow SQL port. No direct
 * superuser/service_role and no transaction pooling.
 */
import {construirBrokerWhapiPrivado} from './whapi-crypto-broker.ts';
import type {PostgresFactoryD088} from './whapi-postgres-driver-d088.ts';
import type {VerificadorCifradoD061}
 from './whapi-quote-inbox-processor-d061.ts';
import type {PuertosCotizadorMvp062}
 from './whapi-quote-pipeline-mvp062.ts';

type Env=Readonly<Record<string,string|undefined>>;
type Session=ReturnType<PostgresFactoryD088>;
type Reserved=Awaited<ReturnType<Session['reserve']>>;
const REF='qkercsoqhehbenbbncwk';
const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/u;
const KEYID=/^[a-z][a-z0-9_]{2,40}$/u;
const HEX=/^[a-f0-9]{64}$/u;
const PORTS={
 cola:{login:'cotironda_quote_worker_queue_login_d092',
  gateway:'cotironda_queue_gateway_d062',secret:'COTIRONDA_QUOTE_DB_URL_QUEUE'},
 lectura:{login:'cotironda_quote_worker_read_login_d092',
  gateway:'cotironda_quote_gateway_d061',secret:'COTIRONDA_QUOTE_DB_URL_READ'},
 escritura:{login:'cotironda_quote_worker_write_login_d092',
  gateway:'cotironda_original_gateway_d093',secret:'COTIRONDA_QUOTE_DB_URL_WRITE'}
} as const;
type Port=keyof typeof PORTS;
const IDENT='select session_user as login, current_user as rol';
function deny():never{throw Error('mvp062_quote_sql_no_disponible')}
function key(v:unknown):Buffer{
 if(typeof v!=='string'||!HEX.test(v))deny();
 const b=Buffer.from(v,'hex');if(b.every(x=>x===0))deny();return b;
}
function validRows(v:unknown,login:string,rol:string):boolean{
 return Array.isArray(v)&&v.length===1&&v[0]!==null&&
  typeof v[0]==='object'&&
  Object.keys(v[0]).length===2&&
  v[0].login===login&&v[0].rol===rol;
}
function validUrl(raw:string,login:string):void{
 if(typeof raw!=='string'||raw.length>1500)deny();
 let p:URL;
 try{p=new URL(raw)}catch{deny()}
 if(!['postgres:','postgresql:'].includes(p.protocol)||
  p.port!=='5432'||p.pathname!=='/postgres'||
  p.search!==''||p.hash!==''||!p.password)deny();
 const direct=p.hostname===`db.${REF}.supabase.co`;
 const pooler=/^aws-[0-9]+-sa-east-1\.pooler\.supabase\.com$/u.test(p.hostname);
 if(!direct&&!pooler)deny();
 try{
  if(decodeURIComponent(p.username)!==(direct?login:`${login}.${REF}`)||
   decodeURIComponent(p.password).length<24)deny();
 }catch{deny()}
}
export type QuoteResourcesMvp062=Readonly<{
 sql:PuertosCotizadorMvp062;
 verificar:VerificadorCifradoD061;
 cerrar:()=>Promise<void>;
}>;
export async function abrirRecursosCotizadorMvp062(
 env:Env,factory:PostgresFactoryD088
):Promise<QuoteResourcesMvp062>{
 if(!env||env.VERCEL_ENV!=='preview'||
  env.VERCEL_GIT_COMMIT_REF!=='integration/mvp-piloto-20261031'||
  env.COTIRONDA_REGISTRATION_ENABLED==='true'||
  env.COTIRONDA_QUOTE_WORKER_ENABLED!=='true'||
  env.COTIRONDA_QUOTE_WORKER_PILOT_AUTHORIZED!=='true'||
  env.COTIRONDA_QUOTE_WORKER_DB_DRIVER_ENABLED!=='true'||
  env.COTIRONDA_QUOTE_WORKER_DB_PROJECT_REF!==REF||
  typeof factory!=='function'||
  !CHANNEL.test(env.COTIRONDA_WHAPI_CHANNEL??''))deny();
 const ca=env.COTIRONDA_QUOTE_WORKER_DB_ROOT_CA_PEM;
 if(typeof ca!=='string'||ca.length<200||ca.length>10000||
   !ca.startsWith('-----BEGIN CERTIFICATE-----')||
   !ca.trimEnd().endsWith('-----END CERTIFICATE-----'))deny();
 const secret=env.COTIRONDA_WHAPI_WEBHOOK_SECRET;
 const keyId=env.COTIRONDA_WHAPI_AES_KEY_ID;
 if(typeof secret!=='string'||secret.length<32||secret.length>256||
   typeof keyId!=='string'||!KEYID.test(keyId)||keyId==='legacy_d029')
  deny();
 const id=key(env.COTIRONDA_WHAPI_HMAC_ID_HEX);
 const fingerprint=key(env.COTIRONDA_WHAPI_HMAC_FINGERPRINT_HEX);
 const aes=key(env.COTIRONDA_WHAPI_AES_CONTENT_HEX);
 if(id.equals(fingerprint)||id.equals(aes)||fingerprint.equals(aes))deny();
 const urls={} as Record<Port,string>;
 for(const port of Object.keys(PORTS) as Port[]){
  const v=env[PORTS[port].secret];
  if(typeof v!=='string')deny();
  validUrl(v,PORTS[port].login);
  urls[port]=v;
 }
 const opened:{client:Session;reserved?:Reserved}[]=[];
 let closed=false;
 const close=async()=>{
  if(closed)return;
  closed=true;
  for(const item of opened.reverse()){
   try{await item.reserved?.release()}catch{}
   try{await item.client.end({timeout:3})}catch{}
  }
 };
 const ports={} as Record<Port,PuertosCotizadorMvp062[Port]>;
 try{
  for(const port of Object.keys(PORTS) as Port[]){
   const {login,gateway}=PORTS[port];
   const client=factory(urls[port],{
    max:1,max_pipeline:1,prepare:false,fetch_types:false,
    connect_timeout:5,idle_timeout:5,ssl:{ca,rejectUnauthorized:true}
   });
   if(!client||typeof client.reserve!=='function'||
    typeof client.end!=='function')deny();
   const handle:{client:Session;reserved?:Reserved}={client};
   opened.push(handle);
   const reserved=await client.reserve();
   if(!reserved||typeof reserved.unsafe!=='function'||
      typeof reserved.release!=='function')deny();
   handle.reserved=reserved;
   if(!validRows(await reserved.unsafe(IDENT,[]),login,login))deny();
   await reserved.unsafe(`set role ${gateway}`,[]);
   if(!validRows(await reserved.unsafe(IDENT,[]),login,gateway))deny();
   ports[port]=Object.freeze({
    query:async(sql:string,args:readonly unknown[])=>{
     if(closed||!Array.isArray(args)||typeof sql!=='string')deny();
     try{
      const rows=await reserved.unsafe(sql,args);
      if(!Array.isArray(rows))deny();
      return {rows:Array.from(rows)};
     }catch{deny()}
    }
   });
  }
  const broker=construirBrokerWhapiPrivado({
   channel:env.COTIRONDA_WHAPI_CHANNEL!,
   secretoWebhook:secret,habilitado:false,
   ahoraUnix:()=>Math.floor(Date.now()/1000),
   contenidoKeyId:keyId,
   claves:{identidadHmac:id,huellaHmac:fingerprint,contenidoAes:aes},
   almacen:{
    resolverVinculo:async()=>deny(),
    registrarEntrada:async()=>deny(),
    registrarBaja:async()=>deny()
   }
  });
  return Object.freeze({
   sql:ports as PuertosCotizadorMvp062,
   verificar:broker.verificarContenido,
   cerrar:close
  });
 }catch{
  await close();deny();
 }
}
