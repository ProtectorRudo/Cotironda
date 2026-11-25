'use client';
import {useEffect,useRef,useState} from 'react';

// El enlace de WhatsApp puede ser de un solo uso. El perfil, no:
// primero se revalida la sesión privada existente en el MISMO origen.
const TOKEN=/^[A-Za-z0-9_-]{43}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const PROFILE='/piloto/v2/mi-cotironda';

type SessionCheck='authorized'|'missing'|'unavailable';
type Phase='checking'|'retry'|'recover';
export function AccesoWhatsappD016(){
 // No persistir credenciales ni tickets fuera de la cookie privada del servidor.
 // El ref sobrevive a la doble ejecución de efectos de React StrictMode.
 const fragment=useRef<string|null>(null);
 const [attempt,setAttempt]=useState(0);
 const [phase,setPhase]=useState<Phase>('checking');
 const [message,setMessage]=useState('Abriendo tus cotizaciones…');
 const [recovery,setRecovery]=useState<'idle'|'sending'|'submitted'|'error'>('idle');

 async function recover(){
  if(recovery==='sending'||recovery==='submitted')return;
  setRecovery('sending');
  try{
   const response=await fetch('/api/piloto/v2/acceso/recuperar',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'x-cotironda-reissue':'1'},
    signal:AbortSignal.timeout(20_000)
   });
   setRecovery(response.status===202?'submitted':'error');
  }catch{setRecovery('error')}
 }
 function retry(){
  setPhase('checking');setMessage('Verificando tu acceso privado…');
  setAttempt(value=>value+1);
 }

 useEffect(()=>{
  let active=true;
  const controller=new AbortController();
  if(fragment.current===null){
   fragment.current=window.location.hash.slice(1);
   // El ticket nunca queda en la barra ni en el historial del navegador.
   window.history.replaceState(null,'',window.location.pathname);
  }
  const values=new URLSearchParams(fragment.current);
  const ticket=values.get('d016');
  const ronda=values.get('ronda');
  const validTicket=values.size===2&&ticket!==null&&TOKEN.test(ticket)&&
   ronda!==null&&UUID.test(ronda);

  const checkSession=async():Promise<SessionCheck>=>{
   try{
    const response=await fetch('/api/piloto/v2/mi-cotironda',{
     method:'GET',credentials:'same-origin',cache:'no-store',
     signal:controller.signal
    });
    if(!active)return 'unavailable';
    if([401,403,404].includes(response.status))return 'missing';
    if(!response.ok)return 'unavailable';
    const data:unknown=await response.json();
    if(!data||typeof data!=='object'||Array.isArray(data))return 'unavailable';
    const obj=data as Record<string,unknown>;
    if(obj.estado!=='historial_autorizado'||!Array.isArray(obj.cotizaciones))
     return 'unavailable';
    // Si el ticket pertenece a otra cuenta/ronda NO reutilizar una sesión
    // de un comprador distinto. El servidor decide tras canjear el ticket.
    if(validTicket&&!obj.cotizaciones.some(item=>item&&
      typeof item==='object'&&!Array.isArray(item)&&
      (item as {rondaId?:unknown}).rondaId===ronda))
     return 'missing';
    return 'authorized';
   }catch{return 'unavailable'}
  };
  const openProfile=()=>{
   if(active)window.location.replace(PROFILE);
  };
  const run=async()=>{
   // Primero la sesión HttpOnly revalidada por la RPC privada de historial:
   // nunca canjear un ticket consumido si el comprador ya está autorizado.
   const session=await checkSession();
   if(!active)return;
   if(session==='authorized'){openProfile();return}
   if(session==='unavailable'){
    setMessage('No pudimos comprobar tu acceso. Volvé a intentar.');
    setPhase('retry');return;
   }
   if(!validTicket){
    setMessage('Este navegador todavía no tiene una sesión privada activa.');
    setPhase('recover');return;
   }
   try{
    const response=await fetch('/api/piloto/v2/acceso/canjear',{
     method:'POST',cache:'no-store',credentials:'same-origin',
     headers:{'content-type':'application/json'},
     body:JSON.stringify({ticket}),signal:controller.signal
    });
    if(!active)return;
    const data:unknown=await response.json();
    if(response.ok&&data&&typeof data==='object'&&!Array.isArray(data)&&
      (data as Record<string,unknown>).state==='SESSION_CREATED'){
     openProfile();return;
    }
   }catch{/* Puede haberse canjeado en otra pestaña. Revalidar sesión. */}
   // Dos clics concurrentes pueden consumir el mismo token UNA vez.
   // Comprobar cookie real ANTES de atribuir el error a un vencimiento.
   const after=await checkSession();
   if(!active)return;
   if(after==='authorized'){openProfile();return}
   if(after==='unavailable'){
    setMessage('No pudimos confirmar el acceso. Volvé a intentar.');
    setPhase('retry');return;
   }
   setMessage('No hay una sesión activa para este enlace. Podés recuperar tu acceso por WhatsApp.');
   setPhase('recover');
  };
  // Evita que React StrictMode consuma dos veces un token durante remount
  // de efectos. La limpieza cancela la petición y el siguiente efecto
  // conserva el fragmento exclusivamente en memoria.
  const start=window.setTimeout(()=>{void run()},0);
  return ()=>{
   active=false;
   window.clearTimeout(start);
   controller.abort();
  };
 },[attempt]);

 return <div>
  <p role="status" aria-live="polite">{message}</p>
  {phase==='retry'&&<button type="button" onClick={retry}>
   Volver a intentar
  </button>}
  {phase==='recover'&&<>
   <p>Tu perfil y tus cotizaciones se conservan. El acceso se recupera exclusivamente desde el WhatsApp registrado, sin contraseñas ni SMS.</p>
   <button type="button" disabled={recovery==='sending'||recovery==='submitted'}
    onClick={()=>void recover()}>
    {recovery==='sending'?'Solicitando acceso…':'Recibir acceso por WhatsApp'}
   </button>
   {recovery==='submitted'&&<p role="status">Solicitud procesada. Si tu cuenta está habilitada, el nuevo acceso llegará a tu WhatsApp registrado.</p>}
   {recovery==='error'&&<p role="alert">No pudimos procesarlo ahora. No se enviarán mensajes repetidos automáticamente.</p>}
  </>}
 </div>;
}
