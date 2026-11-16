'use client';
import {useEffect,useRef,useState} from 'react';

const TOKEN=/^[A-Za-z0-9_-]{43}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
export function AccesoWhatsappD016(){
 const started=useRef(false);
 const mounted=useRef(false);
 const [message,setMessage]=useState('Verificando tu enlace privado…');
 const [canRecover,setCanRecover]=useState(false);
 const [recovery,setRecovery]=useState<'idle'|'sending'|'submitted'|'error'>('idle');
 async function recover(){
  if(recovery==='sending'||recovery==='submitted')return;
  setRecovery('sending');
  try{
   const r=await fetch('/api/piloto/v2/acceso/recuperar',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'x-cotironda-reissue':'1'},
    signal:AbortSignal.timeout(20_000)
   });
   setRecovery(r.status===202?'submitted':'error');
  }catch{setRecovery('error')}
 }

 useEffect(()=>{
  mounted.current=true;
  if(started.current)return ()=>{mounted.current=false};
  started.current=true;
  const fragment=window.location.hash.slice(1);
  // El token desaparece del historial antes de cualquier solicitud o navegación.
  window.history.replaceState(null,'',window.location.pathname);
  const values=new URLSearchParams(fragment);
  const ticket=values.get('d016');
  const ronda=values.get('ronda');
  if(values.size!==2||!ticket||!TOKEN.test(ticket)||!ronda||!UUID.test(ronda)){
   // Un enlace usado borra el fragmento del historial por privacidad.
   // Si el comprador recarga esa pestaña, el fragmento ya no existe.
   // No exigirle otro WhatsApp: comprobar la sesión HttpOnly vigente
   // en el MISMO origen y redirigir al escritorio autorizado.
   void (async()=>{
    try{
     const response=await fetch('/api/piloto/v2/mi-cotironda',{
      method:'GET',cache:'no-store',credentials:'same-origin',
      signal:AbortSignal.timeout(10_000)
     });
     if(!mounted.current)return;
     if(response.ok){
      const raw:unknown=await response.json();
      if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&
       (raw as Record<string,unknown>).estado==='historial_autorizado'&&
       Array.isArray((raw as Record<string,unknown>).cotizaciones)){
       window.location.replace('/piloto/v2/mi-cotironda');
       return;
      }
     }
    }catch{
     // No conceder acceso si hay falla de red o sesión inválida.
    }
    if(mounted.current){
     setMessage('Este navegador todavía no tiene una sesión privada activa.');
     setCanRecover(true);
    }
   })();
   return;
  }
  void (async()=>{
   try{
    const response=await fetch('/api/piloto/v2/acceso/canjear',{
     method:'POST',cache:'no-store',credentials:'same-origin',
     headers:{'content-type':'application/json'},
     body:JSON.stringify({ticket}),signal:AbortSignal.timeout(15_000)
    });
    const data:unknown=await response.json();
    if(!mounted.current)return;
    if(!response.ok||!data||typeof data!=='object'||
       (data as Record<string,unknown>).state!=='SESSION_CREATED')
     throw Error('denied');
    // El enlace sigue validando su ronda original en SQL, pero el destino
    // comercial es el perfil estable con todo el historial del comprador.
    window.location.replace('/piloto/v2/mi-cotironda');
   }catch{
    if(mounted.current){
     setMessage('Este enlace venció o ya fue utilizado.');
     setCanRecover(true);
    }
   }
  })();
  return ()=>{mounted.current=false};
 },[]);
 return <div>
  <p role="status" aria-live="polite">{message}</p>
  {canRecover&&<>
   <p>Podés recibir otro enlace privado en el WhatsApp verificado del comprador, sin SMS ni enviar palabras especiales.</p>
   <button type="button" disabled={recovery==='sending'||recovery==='submitted'}
    onClick={()=>void recover()}>
    {recovery==='sending'?'Solicitando acceso…':'Enviar nuevo enlace por WhatsApp'}
   </button>
   {recovery==='submitted'&&<p role="status">Solicitud procesada. Si la cuenta piloto está habilitada, llegará al chat registrado.</p>}
   {recovery==='error'&&<p role="alert">No se pudo solicitar en este momento. No se harán reenvíos automáticos.</p>}
  </>}
 </div>;
}
