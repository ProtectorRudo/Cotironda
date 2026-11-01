/**
 * MVP-052 — PostgreSQL session boundary for the Whapi HTTPS inbox.
 *
 * This is NOT a database driver or an enabled Next route. A private server
 * operator must inject a ONE-REQUEST, DEDICATED SQL connection after #175.
 * No credentials, pg imports, HTTP, secrets, pool or SQL migrations here.
 *
 * Enforces session_user (technical LOGIN) and effective current_user (D084).
 * Never expose this factory to browsers or use postgres/service_role.
 */
import type {PuertoPostgresD030} from './whapi-postgres-gateway.ts';

export type ClientePostgresD085=Readonly<{
  connect:()=>Promise<void>;
  query:(sql:string,params?:readonly unknown[])=>
    Promise<Readonly<{rows:readonly Record<string,unknown>[] }>>;
  end:()=>Promise<void>;
}>;

const LOGIN='cotironda_whapi_http_login_d085';
const ROLE='cotironda_whapi_http_gateway_d084';
const IDENT='select session_user as login, current_user as rol';
const SET_ROLE='set role cotironda_whapi_http_gateway_d084';

// Exact six SQL statements that existing D030 / D074 issue. No arbitrary
// SQL, interpolation, SQL statements from webhooks or Auth/Storage access.
const SQL_ALLOWED=new Map<string,number>([
  ['select cotironda_private.whapi_resolve_active_contact_v1($1::text,$2::text) as payload',2],
  ['select cotironda_private.whapi_inbox_record_keyed_v1($1::text,$2::text,$3::text,$4::text,$5::text,$6::bytea,$7::bytea,$8::bytea,$9::bigint,$10::text) as payload',10],
  ['select cotironda_private.whapi_record_optout_v1($1::text,$2::text,$3::text,$4::text,$5::bigint) as payload',5],
  ['select cotironda_private.whapi_resolve_buyer_d074($1::text,$2::text) as payload',2],
  ['select cotironda_private.whapi_record_buyer_d074($1::text,$2::text,$3::text,$4::text,$5::text,$6::bytea,$7::bytea,$8::bytea,$9::bigint,$10::text) as payload',10],
  ['select cotironda_private.whapi_buyer_optout_d074($1::text,$2::text,$3::text,$4::text,$5::bigint) as payload',5],
]);

function unavailable():never{throw Error('whapi_sql_privado_no_disponible');}
function identity(out:unknown):{login:string;rol:string}|null{
  if(out===null||typeof out!=='object'||!('rows' in out)||
    !Array.isArray(out.rows)||out.rows.length!==1)return null;
  const row=out.rows[0] as unknown;
  if(row===null||typeof row!=='object'||Array.isArray(row))return null;
  const obj=row as Record<string,unknown>;
  if(Object.keys(obj).length!==2||typeof obj.login!=='string'||
     typeof obj.rol!=='string')return null;
  return {login:obj.login,rol:obj.rol};
}

/**
 * D084 group role is NOLOGIN and has only six EXECUTE grants. The dedicated
 * D085 LOGIN must be created privately, have SET ROLE privilege via membership,
 * and no superuser/BYPASSRLS/table rights. The known login name fails closed
 * for an accidental admin/service connection, even if it can SET ROLE.
 *
 * A session-level SET ROLE is intentional: this connector MUST be dedicated,
 * never a shared pool connection or a transaction-pooler connection. The
 * injected end() must close it, not release it to a general privileged pool.
 */
export async function abrirPuertoPostgresWhapiD085(
  crearConexion:()=>ClientePostgresD085
):Promise<PuertoPostgresD030>{
  if(typeof crearConexion!=='function')unavailable();
  let db:ClientePostgresD085;
  try{db=crearConexion();}catch{unavailable()}
  if(!db||typeof db.connect!=='function'||
    typeof db.query!=='function'||typeof db.end!=='function')
    unavailable();
  let closed=false;
  async function cerrar(){
    if(closed)return;
    closed=true;
    try{await db.end();}catch{unavailable()}
  }
  try{
    await db.connect();
    const initial=identity(await db.query(IDENT,[]));
    if(!initial||initial.login!==LOGIN||initial.rol!==LOGIN)
      unavailable();
    await db.query(SET_ROLE,[]);
    const current=identity(await db.query(IDENT,[]));
    if(!current||current.login!==LOGIN||current.rol!==ROLE)
      unavailable();
  }catch{
    try{await cerrar()}catch{ /* Never expose secrets or SQL errors. */ }
    unavailable();
  }

  return Object.freeze({
    query:async(sql:string,params:readonly unknown[])=>{
      if(closed||typeof sql!=='string'||!Array.isArray(params)||
        !SQL_ALLOWED.has(sql)||params.length!==SQL_ALLOWED.get(sql))
        unavailable();
      try{return await db.query(sql,params);}
      catch{unavailable()}
    },
    cerrar
  });
}
