/**
 * D030 - puerto PostgreSQL PRIVADO para el broker D029.
 *
 * No crea conexiones, contraseñas, migraciones ni endpoints. La dependencia
 * 'query' DEBE venir de un worker autenticado con acceso SOLO a rol gateway
 * NOLOGIN (por membresía de un login server-only pendiente).
 *
 * El SQL es fijo y PARAMETRIZADO; jamás se interpolan datos Whapi.
 */
import type {AlmacenWhapiPrivado,EntradaCifradaD028,
  EntradaCifradaCompradorMvp042,BajaProtegidaCompradorMvp042,
  BajaProtegidaD028,ResultadoD028,VinculoConfiable} from './whapi-crypto-broker.ts';

export type PuertoPostgresD030=Readonly<{
  query:(sql:string,params:readonly unknown[])=>
    Promise<Readonly<{rows:readonly Record<string,unknown>[] }>>;
  // For one-request connections opened by an HTTP adapter. Never close a
  // shared pool here; the injected owner decides the appropriate lifecycle.
  cerrar?:()=>Promise<void>;
}>;

const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/;
const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const KINDS=new Set(['text','image','document','audio','voice']);
const RESOLVE_SQL='select cotironda_private.whapi_resolve_active_contact_v1($1::text,$2::text) as payload';
const INSERT_SQL='select cotironda_private.whapi_inbox_record_v1($1::text,$2::text,$3::text,$4::text,$5::text,$6::bytea,$7::bytea,$8::bytea,$9::bigint) as payload';
const INSERT_KEYED_SQL='select cotironda_private.whapi_inbox_record_keyed_v1($1::text,$2::text,$3::text,$4::text,$5::text,$6::bytea,$7::bytea,$8::bytea,$9::bigint,$10::text) as payload';
const KEY_ID=/^[a-z][a-z0-9_]{2,40}$/;
const BAJA_SQL='select cotironda_private.whapi_record_optout_v1($1::text,$2::text,$3::text,$4::text,$5::bigint) as payload';
function fallo():never{throw new Error('whapi_gateway_no_disponible')}
function obj(o:unknown):o is Record<string,unknown>{
  return o!==null&&typeof o==='object'&&!Array.isArray(o);
}
function exact(o:unknown,keys:readonly string[]):o is Record<string,unknown>{
  return obj(o)&&Object.keys(o).length===keys.length&&
    Object.keys(o).every(k=>keys.includes(k));
}
function sha(s:unknown):s is string{return typeof s==='string'&&SHA.test(s)}
function ch(s:unknown):s is string{return typeof s==='string'&&CHANNEL.test(s)}
function time(s:unknown):s is number{
  return typeof s==='number'&&Number.isSafeInteger(s)&&s>0;
}
function buffer(s:unknown,n:number|readonly[number,number]):s is Buffer{
  return Buffer.isBuffer(s)&&(typeof n==='number'?s.length===n:
    s.length>=n[0]&&s.length<=n[1]);
}
function parseResult(raw:unknown,estado:'entrada_persistida'|'baja_registrada'):ResultadoD028{
  if(!exact(raw,['estado','repetido'])||raw.estado!==estado||
    typeof raw.repetido!=='boolean')fallo();
  return {estado,repetido:raw.repetido as boolean};
}
export function crearPuertoPostgresWhapiD030(db:PuertoPostgresD030):AlmacenWhapiPrivado{
  if(!db||typeof db.query!=='function')fallo();
  async function call(sql:string,params:readonly unknown[]):Promise<unknown>{
    try{
      const out=await db.query(sql,params);
      if(!obj(out)||!Array.isArray(out.rows)||out.rows.length!==1||
        !exact(out.rows[0],['payload']))fallo();
      return out.rows[0].payload;
    }catch{
      // No propagar SQL, IDs, claves, datos de negocio ni conexión al webhook.
      fallo();
    }
  }
  return {
    resolverVinculo:async(channel,chatKey):Promise<VinculoConfiable|null>=>{
      if(!ch(channel)||!sha(chatKey))fallo();
      const raw=await call(RESOLVE_SQL,[channel,chatKey]);
      if(raw===null)return null;
      if(!exact(raw,['supplierOrgId','roundId',
        'consentimientoVigente','invitacionVigente'])||
        typeof raw.supplierOrgId!=='string'||!UUID.test(raw.supplierOrgId)||
        typeof raw.roundId!=='string'||!UUID.test(raw.roundId)||
        raw.consentimientoVigente!==true||raw.invitacionVigente!==true)fallo();
      return {
        supplierOrgId:raw.supplierOrgId as string,
        roundId:raw.roundId as string,
        consentimientoVigente:true,invitacionVigente:true
      };
    },
    registrarEntrada:async(d:EntradaCifradaD028):Promise<ResultadoD028>=>{
      if(!obj(d)||!ch(d.channel)||!sha(d.chatKey)||!sha(d.messageKey)||
         !sha(d.fingerprint)||!KINDS.has(d.kind)||
         !buffer(d.ciphertext,[1,8192])||!buffer(d.nonce,12)||
         !buffer(d.tag,16)||!time(d.sourceUnix))fallo();
      const id=d.cryptoKeyId??'legacy_d029';
      if(!KEY_ID.test(id))fallo();
      const params=[d.channel,d.chatKey,d.messageKey,
        d.fingerprint,d.kind,d.ciphertext,d.nonce,d.tag,d.sourceUnix];
      // Compatibilidad D028: solo legacy; la ruta nueva exige key-id persistente.
      const raw=id==='legacy_d029'?
        await call(INSERT_SQL,params):
        await call(INSERT_KEYED_SQL,[...params,id]);
      return parseResult(raw,'entrada_persistida');
    },
    registrarBaja:async(d:BajaProtegidaD028):Promise<ResultadoD028>=>{
      if(!obj(d)||!ch(d.channel)||!sha(d.chatKey)||!sha(d.messageKey)||
         !sha(d.fingerprint)||!time(d.sourceUnix))fallo();
      const raw=await call(BAJA_SQL,[d.channel,d.chatKey,d.messageKey,
        d.fingerprint,d.sourceUnix]);
      return parseResult(raw,'baja_registrada');
    }
  };
}


/**
 * MVP-043: opt-in bridge to D074 buyer SQL. The existing D030 supplier
 * adapter is unchanged; only a deliberately selected private worker may
 * construct this dual-role variant. Never connect directly to browser.
 */
export function crearPuertoPostgresWhapiDualD074(db:PuertoPostgresD030):
 AlmacenWhapiPrivado{
 const supplier=crearPuertoPostgresWhapiD030(db);
 async function call(sql:string,args:readonly unknown[]):Promise<unknown>{
  try{
   const result=await db.query(sql,args);
   if(!obj(result)||!Array.isArray(result.rows)||result.rows.length!==1||
    !exact(result.rows[0],['payload']))fallo();
   return result.rows[0].payload;
  }catch{fallo()}
 }
 const RESOLVE='select cotironda_private.whapi_resolve_buyer_d074($1::text,$2::text) as payload';
 const INSERT='select cotironda_private.whapi_record_buyer_d074($1::text,$2::text,$3::text,$4::text,$5::text,$6::bytea,$7::bytea,$8::bytea,$9::bigint,$10::text) as payload';
 const OPT_OUT='select cotironda_private.whapi_buyer_optout_d074($1::text,$2::text,$3::text,$4::text,$5::bigint) as payload';
 return Object.freeze({
  ...supplier,
  resolverComprador:async(channel,chatKey)=>{
   if(!ch(channel)||!sha(chatKey))fallo();
   const out=await call(RESOLVE,[channel,chatKey]);
   if(out===null)return null;
   if(!exact(out,['buyerOrgId','consentimientoContactoVigente',
     'chatHabilitado'])||typeof out.buyerOrgId!=='string'||
     !UUID.test(out.buyerOrgId)||out.consentimientoContactoVigente!==true||
     out.chatHabilitado!==true)fallo();
   return Object.freeze({
    buyerOrgId:out.buyerOrgId as string,
    consentimientoContactoVigente:true as const,
    chatHabilitado:true as const
   });
  },
  registrarEntradaComprador:async(d:EntradaCifradaCompradorMvp042)=>{
   if(!obj(d)||!ch(d.channel)||!sha(d.chatKey)||!sha(d.messageKey)||
    !sha(d.fingerprint)||!UUID.test(d.buyerOrgId)||
    !KINDS.has(d.kind)||!buffer(d.ciphertext,[1,8192])||
    !buffer(d.nonce,12)||!buffer(d.tag,16)||!time(d.sourceUnix)||
    typeof d.cryptoKeyId!=='string'||!KEY_ID.test(d.cryptoKeyId)||
    d.cryptoKeyId==='legacy_d029')fallo();
   const out=await call(INSERT,[d.channel,d.chatKey,d.messageKey,
    d.fingerprint,d.kind,d.ciphertext,d.nonce,d.tag,
    d.sourceUnix,d.cryptoKeyId]);
   return parseResult(out,'entrada_persistida');
  },
  registrarBajaComprador:async(d:BajaProtegidaCompradorMvp042)=>{
   if(!obj(d)||!ch(d.channel)||!sha(d.chatKey)||!sha(d.messageKey)||
    !sha(d.fingerprint)||!UUID.test(d.buyerOrgId)||!time(d.sourceUnix))fallo();
   const out=await call(OPT_OUT,[d.channel,d.chatKey,d.messageKey,
    d.fingerprint,d.sourceUnix]);
   return parseResult(out,'baja_registrada');
  }
 } satisfies AlmacenWhapiPrivado);
}
