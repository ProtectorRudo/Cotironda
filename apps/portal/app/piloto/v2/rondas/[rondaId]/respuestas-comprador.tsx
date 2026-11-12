'use client';
/** Buyer-only V2 portal. Session JWT is sent ONLY in Authorization header;
 * the server independently verifies getUser + auth.sessions and V2 source.
 */
import {useEffect,useMemo,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import type {CatalogoRespuestasV2} from '../../../../../../../src/server/v2-03-catalogo-respondedores.ts';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const EXT:Readonly<Record<string,string>>={
 PDF:'pdf',Excel:'xlsx',Word:'docx','Imagen JPEG':'jpg',
 'Imagen PNG':'png','Imagen WebP':'webp',CSV:'csv',Texto:'txt'
};
export function RespuestasCompradorV2({rondaId}:{rondaId:string}){
 const client=useMemo(()=>{
  const url=process.env.NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY;
  if(url!==PILOT||!key?.startsWith('sb_publishable_'))return null;
  return createClient(url,key,{
   auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
  });
 },[]);
 const [authenticated,setAuthenticated]=useState(false);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [phone,setPhone]=useState('');
 const [otp,setOtp]=useState('');
 const [requested,setRequested]=useState(false);
 const [catalog,setCatalog]=useState<CatalogoRespuestasV2|null>(null);
 const [error,setError]=useState('');
 const api='/api/piloto/v2/rondas/'+encodeURIComponent(rondaId);
 useEffect(()=>{
  if(!client){setLoading(false);return}
  let active=true;
  void client.auth.getSession().then(({data})=>{
   if(!active)return;
   setAuthenticated(!!data.session?.access_token);
   setLoading(false);
  }).catch(()=>{if(active)setLoading(false)});
  const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{
   if(!active)return;
   setAuthenticated(!!session?.access_token);
   if(!session)setCatalog(null);
  });
  return ()=>{active=false;subscription.unsubscribe()};
 },[client]);

 async function token():Promise<string|null>{
  if(!client)return null;
  const {data,error:authError}=await client.auth.getSession();
  if(authError)return null;
  // getSession is transport ONLY, never trusted as authorization by server.
  return data.session?.access_token??null;
 }
 async function refresh(){
  setBusy(true);setError('');
  try{
   const access=await token();
   if(!access){setCatalog(null);setAuthenticated(false);return;}
   const response=await fetch(api+'/respuestas',{
    method:'GET',cache:'no-store',credentials:'omit',
    headers:{Authorization:'Bearer '+access}
   });
   if(!response.ok){setCatalog(null);setError('No se pudo cargar tu pedido.');return;}
   const payload:CatalogoRespuestasV2=await response.json();
   if(payload.estado!=='cotizaciones_recibidas'||
      !Array.isArray(payload.respuestas))throw Error('invalid_response');
   setCatalog(payload);
  }catch{setError('No se pudo cargar tu pedido.')}
  finally{setBusy(false)}
 }
 useEffect(()=>{
  if(authenticated&&!catalog&&!busy)void refresh();
  // Refresh once when authenticated; additional refreshes only by user action.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[authenticated]);

 async function sendOtp(){
  if(!client||busy)return;
  if(!/^\+[1-9]\d{8,15}$/u.test(phone.trim())){
   setError('Ingresá tu teléfono con código de país, por ejemplo +54…');return;
  }
  setBusy(true);setError('');
  try{
   const {error:sendError}=await client.auth.signInWithOtp({
    phone:phone.trim(),options:{shouldCreateUser:false}
   });
   if(sendError)throw Error('otp_failed');
   setRequested(true);
  }catch{setError('No se pudo verificar tu acceso. Revisá tu número.')}
  finally{setBusy(false)}
 }
 async function confirmOtp(){
  if(!client||busy)return;
  if(!/^\d{6,8}$/u.test(otp.trim())){setError('Ingresá el código recibido.');return}
  setBusy(true);setError('');
  try{
   const {data,error:verifyError}=await client.auth.verifyOtp({
    phone:phone.trim(),token:otp.trim(),type:'sms'
   });
   if(verifyError||!data.session)throw Error('invalid_otp');
   setAuthenticated(true);setRequested(false);
  }catch{setError('No pudimos comprobar el código de acceso.')}
  finally{setBusy(false)}
 }
 async function download(documentId:string,format:string){
  if(busy)return;
  setBusy(true);setError('');
  try{
   const access=await token();
   if(!access){setAuthenticated(false);throw Error('not_logged');}
   const response=await fetch(api+'/originales/'+encodeURIComponent(documentId),{
    method:'GET',cache:'no-store',credentials:'omit',
    headers:{Authorization:'Bearer '+access}
   });
   if(!response.ok)throw Error('download_denied');
   const data=await response.arrayBuffer();
   if(data.byteLength<1||data.byteLength>8388608)throw Error('invalid_bytes');
   const blob=new Blob([data],{type:response.headers.get('content-type')||
    'application/octet-stream'});
   const objectUrl=URL.createObjectURL(blob);
   const anchor=document.createElement('a');
   anchor.href=objectUrl;
   anchor.download='cotironda-original-'+documentId.slice(0,8)+'.'+(EXT[format]||'bin');
   anchor.style.display='none';
   document.body.appendChild(anchor);anchor.click();anchor.remove();
   window.setTimeout(()=>URL.revokeObjectURL(objectUrl),30000);
  }catch{setError('El original no está disponible para descargar en este momento.')}
  finally{setBusy(false)}
 }
 if(!client)return <p role="status">El ingreso privado todavía no está habilitado.</p>;
 if(loading)return <p role="status">Comprobando acceso…</p>;
 if(!authenticated)return <section aria-label="Identificación del comprador">
  <p>Ingresá con el teléfono autorizado de tu empresa para consultar este pedido.</p>
  <label htmlFor="cotironda-phone">Teléfono con código de país</label>
  <input id="cotironda-phone" inputMode="tel" autoComplete="tel"
   value={phone} onChange={e=>setPhone(e.target.value)} disabled={busy||requested}
   placeholder="+54…" />
  {!requested?
   <button type="button" className="button" disabled={busy} onClick={()=>void sendOtp()}>
    Enviar código de acceso
   </button>:
   <div>
    <label htmlFor="cotironda-otp">Código recibido por SMS</label>
    <input id="cotironda-otp" inputMode="numeric" autoComplete="one-time-code"
     value={otp} onChange={e=>setOtp(e.target.value)} disabled={busy}/>
    <button type="button" className="button" disabled={busy}
     onClick={()=>void confirmOtp()}>Ingresar</button>
   </div>}
  {error&&<p role="alert">{error}</p>}
 </section>;

 return <section aria-label="Cotizaciones de tu pedido">
  <div className="actions">
   <button className="button outline" type="button" disabled={busy}
    onClick={()=>void refresh()}>Actualizar respuestas</button>
   <button className="button outline" type="button" disabled={busy}
    onClick={()=>{void client.auth.signOut();setCatalog(null);}}>
    Cerrar sesión
   </button>
  </div>
  {busy&&<p role="status">Verificando información…</p>}
  {error&&<p role="alert">{error}</p>}
  {catalog?.respuestas.length===0&&
   <p role="status">Todavía no recibimos cotizaciones</p>}
  {catalog?.respuestas.map(item=><article key={item.documentoId}
   className="notice" style={{marginBlock:'1rem'}}>
   <h2>{item.comercio}</h2>
   <p>{item.formato} · Recibido el {new Date(item.recibidoMs).toLocaleString('es-AR',{
    timeZone:'America/Argentina/Buenos_Aires'
   })}</p>
   <p><strong>{item.analisis}</strong></p>
   {item.puntos.length>0&&<ul aria-label="Claves de este presupuesto">
    {item.puntos.map((p,index)=><li key={item.documentoId+'-'+index}>
     <p>{p.observacion}</p>
     <small>Según el original: «{p.evidencia}»</small>
    </li>)}
   </ul>}
   <button className="button" type="button" disabled={busy}
    onClick={()=>void download(item.documentoId,item.formato)}>
    Descargar presupuesto original
   </button>
  </article>)}
 </section>;
}
