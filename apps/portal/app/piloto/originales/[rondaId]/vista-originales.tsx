'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {
 codigoOtpPilotoMvp207,opcionesOriginalesPilotoMvp207,
 proyeccionCatalogoPilotoMvp207,rutaOriginalPilotoMvp207,
 telefonoOtpPilotoMvp207,type DocumentoPublicoMvp207
} from '../../../../../../src/domain/acceso-comprador-originales-mvp207.ts';

type Props=Readonly<{rondaId:string;url:string;publishableKey:string}>;
type Paso='iniciando'|'telefono'|'codigo'|'catalogo';

/**
 * No general signup, no DEV Auth, no WhatsApp token. OTP is only sent after
 * the buyer presses the button. A genuine PILOT Auth user MUST preexist.
 * The browser never receives the service key or the SQL's source envelope.
 */
export function VistaOriginalesPiloto({rondaId,url,publishableKey}:Props){
 const auth=useRef<SupabaseClient|null>(null);
 const revision=useRef(0),ultimoOtp=useRef(0);
 const [paso,setPaso]=useState<Paso>('iniciando');
 const [telefono,setTelefono]=useState('');
 const [codigo,setCodigo]=useState('');
 const [docs,setDocs]=useState<readonly DocumentoPublicoMvp207[]>([]);
 const [mensaje,setMensaje]=useState('');
 const [ocupado,setOcupado]=useState(false);

 const cargar=useCallback(async()=>{
  const client=auth.current;
  if(!client)return;
  const n=++revision.current;
  setOcupado(true);setDocs([]);setMensaje('');
  try{
   // getSession is only a token source; authorization is decided by the
   // backend via PILOT auth.getUser and current DB/session membership.
   const {data,error}=await client.auth.getSession();
   if(error||!data.session){
    if(n===revision.current){
     setPaso('telefono');setMensaje('Ingresá para consultar tus archivos.');
    }
    return;
   }
   const route=rutaOriginalPilotoMvp207(rondaId);
   const options=opcionesOriginalesPilotoMvp207(data.session.access_token);
   if(!route||!options)throw Error('invalid_request');
   const response=await fetch(route,options);
   if(n!==revision.current)return;
   if(response.status===401){
    setPaso('telefono');setMensaje('Tu sesión ya no está vigente. Volvé a ingresar.');
    return;
   }
   if(response.status===503){
    setMensaje('Las descargas todavía no están habilitadas en este entorno.');
    return;
   }
   if(!response.ok){
    setMensaje('No hay originales autorizados para esta solicitud y sesión.');
    return;
   }
   const catalogo=proyeccionCatalogoPilotoMvp207(await response.json());
   if(n!==revision.current)return;
   if(!catalogo)throw Error('invalid_catalog');
   setPaso('catalogo');setDocs(catalogo.documentos);
   if(catalogo.total===0)
    setMensaje('No hay archivos originales autorizados para descargar.');
  }catch{
   if(n===revision.current)
    setMensaje('No fue posible consultar los archivos. Podés volver a intentar.');
  }finally{
   if(n===revision.current)setOcupado(false);
  }
 },[rondaId]);

 useEffect(()=>{
  let active=true;
  const client=createClient(url,publishableKey,{
   auth:{
    // Keep a distinct PILOT session in this tab; never use DEV cookies.
    storageKey:'cotironda-piloto-originales-otp-v1',
    storage:window.sessionStorage,
    persistSession:true,autoRefreshToken:true,detectSessionInUrl:false
   }
  });
  auth.current=client;
  void client.auth.getSession().then(({data,error})=>{
   if(!active)return;
   if(error||!data.session)setPaso('telefono');
   else{setPaso('catalogo');void cargar();}
  }).catch(()=>{if(active)setPaso('telefono')});
  return ()=>{
   active=false;revision.current++;auth.current=null;
  };
 },[url,publishableKey,cargar]);

 async function enviarCodigo(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  const client=auth.current,phone=telefonoOtpPilotoMvp207(telefono);
  if(ocupado||!client)return;
  if(!phone){setMensaje('Escribí el teléfono con código internacional (ej.: +549...).');return;}
  if(Date.now()-ultimoOtp.current<60000){
   setMensaje('Por seguridad, dejá pasar un minuto antes de pedir otro código.');
   return;
  }
  ultimoOtp.current=Date.now();setOcupado(true);setMensaje('');
  try{
   const {error}=await client.auth.signInWithOtp({
    phone,options:{shouldCreateUser:false,channel:'sms'}
   });
   // Do not disclose whether an account exists or was found.
   if(error)setMensaje('No se pudo solicitar el código. Revisá el número o intentá más tarde.');
   else{
    setTelefono(phone);setPaso('codigo');
    setMensaje('Si este número está habilitado, recibirás un código por SMS.');
   }
  }catch{setMensaje('No se pudo solicitar el código. Revisá la conexión.')}
  finally{setOcupado(false)}
 }

 async function verificarCodigo(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  const client=auth.current,phone=telefonoOtpPilotoMvp207(telefono);
  const otp=codigoOtpPilotoMvp207(codigo);
  if(ocupado||!client)return;
  if(!phone||!otp){setMensaje('Ingresá el código numérico recibido.');return;}
  setOcupado(true);setMensaje('');
  try{
   const {data,error}=await client.auth.verifyOtp({
    phone,token:otp,type:'sms'
   });
   setCodigo('');
   if(error||!data.session){
    setMensaje('El código no pudo verificarse. Revisalo o pedí otro.');return;
   }
   setPaso('catalogo');
   // New session is still independently checked by our server.
   await cargar();
  }catch{setMensaje('No fue posible verificar el código.')}
  finally{setOcupado(false)}
 }

 async function descargar(item:DocumentoPublicoMvp207){
  const client=auth.current;
  if(ocupado||!client||!docs.some(d=>d.documentoId===item.documentoId))
   return;
  const n=++revision.current;
  setOcupado(true);setMensaje('');
  try{
   const {data,error}=await client.auth.getSession();
   if(error||!data.session)throw Error('expired_session');
   const route=rutaOriginalPilotoMvp207(rondaId,item.documentoId);
   const options=opcionesOriginalesPilotoMvp207(data.session.access_token);
   if(!route||!options)throw Error('invalid_request');
   const result=await fetch(route,options);
   if(n!==revision.current)return;
   if(result.status===401){
    setDocs([]);setPaso('telefono');
    setMensaje('Tu sesión venció. Volvé a ingresar.');return;
   }
   if(result.status!==200){
    setMensaje('El original no está disponible o su autorización cambió.');
    return;
   }
   const dataFile=await result.blob();
   if(n!==revision.current)return;
   if(dataFile.size<1||dataFile.size>8388608)
    throw Error('unexpected_document_size');
   const localUrl=URL.createObjectURL(dataFile);
   const a=document.createElement('a');
   a.href=localUrl;
   a.download=item.nombre.toLowerCase().replaceAll(' ','-')+'.'+item.extension;
   a.rel='noopener';
   a.click();a.remove();
   window.setTimeout(()=>URL.revokeObjectURL(localUrl),2000);
   setMensaje('Archivo preparado. Revisá las descargas de tu navegador.');
  }catch{
   if(n===revision.current)
    setMensaje('No fue posible descargar el documento. Volvé a consultar el listado.');
  }finally{if(n===revision.current)setOcupado(false)}
 }

 async function salir(){
  revision.current++;
  setDocs([]);setCodigo('');setTelefono('');setMensaje('');
  setPaso('telefono');setOcupado(false);
  try{await auth.current?.auth.signOut()}catch{
   setMensaje('Cerrá esta pestaña si la conexión no permite cerrar la sesión.');
  }
 }

 return <section className="panel" style={{maxWidth:760}} aria-label="Originales autorizados del piloto">
  <span className="eyebrow">PILOTO · ACCESO PRIVADO</span>
  <h1>Presupuestos originales</h1>
  <p>Después del cierre podés descargar los archivos de los proveedores
   que autorizaron compartirlos. La elección final siempre es tuya.</p>
  {paso==='iniciando'&&<p role="status">Comprobando sesión…</p>}
  {paso==='telefono'&&<form onSubmit={e=>void enviarCodigo(e)}>
   <label htmlFor="originales-telefono">Teléfono habilitado</label>
   <input id="originales-telefono" type="tel" required autoComplete="tel"
    inputMode="tel" placeholder="+549..." value={telefono}
    maxLength={17} onChange={e=>setTelefono(e.target.value)}
    disabled={ocupado}/>
   <button disabled={ocupado} type="submit">Recibir código por SMS</button>
   <p className="muted">Solo para compradores previamente autorizados.
    No se crean cuentas nuevas. El código se solicita únicamente al tocar este botón.</p>
  </form>}
  {paso==='codigo'&&<form onSubmit={e=>void verificarCodigo(e)}>
   <label htmlFor="originales-codigo">Código recibido por SMS</label>
   <input id="originales-codigo" type="text" required
    inputMode="numeric" autoComplete="one-time-code"
    maxLength={8} value={codigo} disabled={ocupado}
    onChange={e=>setCodigo(e.target.value)}/>
   <button type="submit" disabled={ocupado}>Verificar y consultar</button>
   <button className="outline" type="button" disabled={ocupado}
    onClick={()=>{setPaso('telefono');setCodigo('');setMensaje('');}}>
    Usar otro número
   </button>
  </form>}
  {paso==='catalogo'&&<>
   <div className="inline-actions">
    <button type="button" disabled={ocupado} onClick={()=>void cargar()}>
     Actualizar originales
    </button>
    <button className="outline" type="button" disabled={ocupado}
     onClick={()=>void salir()}>Cerrar sesión</button>
   </div>
   {docs.length>0&&<ul style={{padding:0,listStyle:'none',display:'grid',gap:12}}>
    {docs.map(doc=><li key={doc.documentoId}
      style={{border:'1px solid #315061',padding:12,borderRadius:12}}>
      <strong>{doc.nombre}</strong> · {doc.formato}
      <button type="button" disabled={ocupado}
       onClick={()=>void descargar(doc)} aria-label={'Descargar '+doc.nombre}>
       Descargar archivo
      </button>
    </li>)}
   </ul>}
   <p className="muted">Solo originales consentidos. Un proveedor sin permiso
    puede tener una oferta visible en el seguimiento, pero su archivo
    identificable no aparece acá.</p>
  </>}
  {mensaje&&<p className="feedback" role="status" aria-live="polite">{mensaje}</p>}
 </section>;
}
