'use client';
/** Buyer-only V2 portal. Session JWT is sent ONLY in Authorization header;
 * the server independently verifies getUser + auth.sessions and V2 source.
 */
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createClient,type Session} from '@supabase/supabase-js';
import type {CatalogoRespuestasV2} from '../../../../../../../src/server/v2-03-catalogo-respondedores.ts';
import {nombreDescargaOriginalV2} from '../../../../../lib/piloto-v2-nombre-descarga.ts';
import {debeActualizarRespuestasV2,INTERVALO_ACTUALIZACION_RESPUESTAS_V2_MS}
 from '../../../../../lib/piloto-v2-actualizacion-respuestas.ts';
import {seleccionarAnalisisPendientesV2,registrarIntentosAnalisisV2,
 type IntentoAnalisisV2}
 from '../../../../../lib/piloto-v2-reintento-analisis.ts';
import {solicitarSmsCompradorV2}
 from '../../../../../../../src/server/v2-16-primer-sms-cotironda.ts';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
export function RespuestasCompradorV2({
 rondaId,puedeConsultarRespuestas
}:{rondaId:string;puedeConsultarRespuestas:boolean}){
 const client=useMemo(()=>{
  const url=process.env.NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY;
  if(url!==PILOT||!key?.startsWith('sb_publishable_'))return null;
  return createClient(url,key,{
   auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
  });
 },[]);
 const historialAnalisis=useRef(new Map<string,IntentoAnalisisV2>());
 const authGeneration=useRef(0);
 const userIdActual=useRef<string|null>(null);
 const refreshInFlight=useRef(false);
 const [sessionVersion,setSessionVersion]=useState(0);
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
  const aplicarSesion=(session:Session|null)=>{
   const nextUserId=session?.user?.id??null;
   if(nextUserId!==userIdActual.current){
    authGeneration.current++;
    userIdActual.current=nextUserId;
    historialAnalisis.current.clear();
    setCatalog(null);setBusy(false);
    setSessionVersion(version=>version+1);
   }
   setAuthenticated(!!session?.access_token);
   setLoading(false);
  };
  void client.auth.getSession().then(({data})=>{
   if(active)aplicarSesion(data.session);
  }).catch(()=>{if(active)setLoading(false)});
  const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{
   if(active)aplicarSesion(session);
  });
  return ()=>{active=false;subscription.unsubscribe()};
 },[client]);

 const token=useCallback(async ():Promise<string|null>=>{
  if(!client)return null;
  const {data,error:authError}=await client.auth.getSession();
  if(authError)return null;
  // getSession is transport ONLY; getUser + auth.sessions validate on server.
  return data.session?.access_token??null;
 },[client]);

 const refresh=useCallback(async (silencioso=false):Promise<void>=>{
  // El SMS puede estar habilitado sin publicar fuentes de cotizaciones.
  // No efectuar peticiones a APIs privadas hasta activar ese circuito.
  if(!puedeConsultarRespuestas)return;
  // Nunca iniciar dos lecturas simultáneas ni conservar datos tras logout.
  if(refreshInFlight.current)return;
  refreshInFlight.current=true;
  const generation=authGeneration.current;
  if(!silencioso){setBusy(true);setError('');}
  try{
   const access=await token();
   if(generation!==authGeneration.current)return;
   if(!access){
    authGeneration.current++;
    userIdActual.current=null;
    setCatalog(null);setAuthenticated(false);
    return;
   }
   const response=await fetch(api+'/respuestas',{
    method:'GET',cache:'no-store',credentials:'omit',
    headers:{Authorization:'Bearer '+access},
    signal:AbortSignal.timeout(15_000)
   });
   if(generation!==authGeneration.current)return;
   // Fail closed: flags revocados o sesión inválida nunca dejan datos viejos.
   if(!response.ok){
    setCatalog(null);setError('No se pudo cargar tu pedido.');return;
   }
   const payload:CatalogoRespuestasV2=await response.json();
   if(generation!==authGeneration.current)return;
   if(payload.estado!=='cotizaciones_recibidas'||
      !Array.isArray(payload.respuestas))throw Error('invalid_response');
   setCatalog(payload);setError('');
  }catch{
   if(generation===authGeneration.current){
    setCatalog(null);setError('No se pudo cargar tu pedido.');
   }
  }finally{
   refreshInFlight.current=false;
   if(!silencioso&&generation===authGeneration.current)setBusy(false);
  }
 },[api,token,puedeConsultarRespuestas]);

 useEffect(()=>{
  if(authenticated&&puedeConsultarRespuestas)void refresh();
  // New auth identity/sessionVersion also refreshes, never trusts local JWT.
 },[authenticated,sessionVersion,refresh,puedeConsultarRespuestas]);

 // Only a visible, authenticated buyer polls for NEW responders.
 // While hidden or signed out, no background requests/IA are started.
 useEffect(()=>{
  if(!authenticated||!client||!puedeConsultarRespuestas)return;
  const sincronizar=()=>{
   if(debeActualizarRespuestasV2({
    autenticado:authenticated,
    paginaVisible:document.visibilityState==='visible',
    ocupado:busy,
    consultaEnCurso:refreshInFlight.current
   }))void refresh(true);
  };
  const intervalo=window.setInterval(sincronizar,INTERVALO_ACTUALIZACION_RESPUESTAS_V2_MS);
  document.addEventListener('visibilitychange',sincronizar);
  window.addEventListener('focus',sincronizar);
  return ()=>{
   window.clearInterval(intervalo);
   document.removeEventListener('visibilitychange',sincronizar);
   window.removeEventListener('focus',sincronizar);
  };
 },[authenticated,client,busy,refresh,puedeConsultarRespuestas]);

 // Reintenta hasta tres veces por original, espaciado seis minutos:
 // SQL mantiene el verdadero máximo de claims y los permisos por empresa.
 // No añade mensajes WhatsApp ni ejecuta IA por el GET periódico.
 useEffect(()=>{
  if(!authenticated||!puedeConsultarRespuestas||
     !catalog||document.visibilityState!=='visible')return;
  const ahoraMs=Date.now();
  const pendientes=seleccionarAnalisisPendientesV2(
   catalog.respuestas,historialAnalisis.current,ahoraMs);
  if(pendientes.length===0)return;
  // Registrar antes de await: renders nuevos no duplican la misma tanda.
  registrarIntentosAnalisisV2(historialAnalisis.current,pendientes,ahoraMs);
  const generation=authGeneration.current;
  void (async()=>{
   const access=await token();
   if(!access||generation!==authGeneration.current)return;
   try{
    await Promise.allSettled(pendientes.map(async documentoId=>{
     if(generation!==authGeneration.current)return;
     await fetch(api+'/originales/'+encodeURIComponent(documentoId)+
      '/analizar',{
      method:'POST',cache:'no-store',credentials:'omit',
      headers:{Authorization:'Bearer '+access},
      signal:AbortSignal.timeout(60_000)
     });
    }));
    if(generation===authGeneration.current)await refresh(true);
   }catch{/* Nunca bloquea el original; habrá reintento espaciado. */}
  })();
 },[catalog,authenticated,api,token,refresh,puedeConsultarRespuestas]);

 function cerrarSesion(){
  authGeneration.current++;
  userIdActual.current=null;
  historialAnalisis.current.clear();
  setCatalog(null);setAuthenticated(false);setError('');setBusy(false);
  void client?.auth.signOut();
 }
 async function sendOtp(){
  if(!client||busy)return;
  if(!/^\+[1-9]\d{7,14}$/u.test(phone.trim())){
   setError('Ingresá tu teléfono con código de país, por ejemplo +54…');return;
  }
  setBusy(true);setError('');
  try{
   const autorizado=await solicitarSmsCompradorV2({
    inicio:()=>client.auth.signInWithOtp({
     phone:phone.trim(),options:{shouldCreateUser:false}
    }),
    confirmarAltaPendiente:()=>client.auth.resend({
     type:'sms',phone:phone.trim()
    })
   });
   if(!autorizado)throw Error('otp_failed');
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
 async function download(documentId:string){
  if(busy||!puedeConsultarRespuestas)return;
  const generation=authGeneration.current;
  setBusy(true);setError('');
  try{
   const access=await token();
   if(generation!==authGeneration.current)return;
   if(!access){setAuthenticated(false);throw Error('not_logged');}
   const response=await fetch(api+'/originales/'+encodeURIComponent(documentId),{
    method:'GET',cache:'no-store',credentials:'omit',
    headers:{Authorization:'Bearer '+access},
    signal:AbortSignal.timeout(20_000)
   });
   if(generation!==authGeneration.current)return;
   if(!response.ok)throw Error('download_denied');
   const data=await response.arrayBuffer();
   // El usuario pudo cerrar sesión o cambiar de cuenta durante el I/O.
   if(generation!==authGeneration.current)return;
   if(data.byteLength<1||data.byteLength>8388608)throw Error('invalid_bytes');
   const blob=new Blob([data],{type:response.headers.get('content-type')||
    'application/octet-stream'});
   const objectUrl=URL.createObjectURL(blob);
   const anchor=document.createElement('a');
   anchor.href=objectUrl;
   anchor.download=nombreDescargaOriginalV2(documentId,response.headers.get('content-type'));
   anchor.style.display='none';
   document.body.appendChild(anchor);anchor.click();anchor.remove();
   window.setTimeout(()=>URL.revokeObjectURL(objectUrl),30000);
  }catch{
   if(generation===authGeneration.current)
    setError('El original no está disponible para descargar en este momento.');
  }finally{
   if(generation===authGeneration.current)setBusy(false);
  }
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
   {puedeConsultarRespuestas&&
    <button className="button outline" type="button" disabled={busy}
     onClick={()=>void refresh()}>Actualizar respuestas</button>}
   <button className="button outline" type="button" disabled={busy}
    onClick={cerrarSesion}>
    Cerrar sesión
   </button>
  </div>
  {!puedeConsultarRespuestas?
   <p role="status">Teléfono verificado. La consulta de presupuestos
    todavía está deshabilitada en este entorno de prueba.</p>:
   <p>Las cotizaciones se actualizan automáticamente cada minuto mientras mirás esta página.</p>}
  {busy&&<p role="status">Verificando información…</p>}
  {error&&<p role="alert">{error}</p>}
  {catalog?.respuestas.length===0&&
   <p role="status">Todavía no recibimos cotizaciones</p>}
  {puedeConsultarRespuestas&&catalog?.respuestas.map(item=><article key={item.documentoId}
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
    onClick={()=>void download(item.documentoId)}>
    Descargar presupuesto original
   </button>
  </article>)}
 </section>;
}
