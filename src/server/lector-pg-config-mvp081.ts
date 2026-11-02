/**
 * MVP081: validar configuracion del lector privado antes de crear conexion.
 * No registrar URLs: incluyen secretos. Solo backend, nunca NEXT_PUBLIC_.
 * El modo produccion permanece deshabilitado durante el piloto.
 */
export type EntornoLectorMvp081=Readonly<{
 habilitado:string|undefined;
 conexion:string|undefined;
 modo:string|undefined;
 vercelEntorno:string|undefined;
 identificadorProyecto:string|undefined;
}>;
const PROJECT='ilggkalaafhtiysyzlmg';
const LOGIN='cotironda_piloto_reader_login';
function deny():never{throw new Error('mvp081_lector_privado_no_configurado')}
export function validarEntornoLectorMvp081(e:EntornoLectorMvp081):string{
 if(!e||typeof e!=='object'||Array.isArray(e)||
  Object.keys(e).sort().join(',')!==
  ['habilitado','conexion','modo','vercelEntorno','identificadorProyecto'].sort().join(',')||
  e.habilitado!=='true'||e.modo!=='development'||
  e.vercelEntorno==='production'||e.identificadorProyecto!==PROJECT||
  typeof e.conexion!=='string'||e.conexion.length>2048)deny();
 let uri:URL;
 try{uri=new URL(e.conexion)}catch{deny()}
 if(!['postgres:','postgresql:'].includes(uri.protocol)||
  ![LOGIN,LOGIN+'.'+PROJECT].includes(decodeURIComponent(uri.username))||
  !uri.password||uri.password.length<20||
  (uri.hostname!==('db.'+PROJECT+'.supabase.co')&&
    !/^[a-z0-9-]+\.pooler\.supabase\.com$/u.test(uri.hostname))||
  (uri.searchParams.has('sslmode')&&uri.searchParams.get('sslmode')!=='require')||
  uri.hash||uri.pathname.length<2)deny();
 // No sanear/normalizar password para retornarlo a logs.
 return e.conexion;
}
