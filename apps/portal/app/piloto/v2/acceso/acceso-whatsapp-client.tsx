'use client';
import {useEffect,useRef,useState} from 'react';

const TOKEN=/^[A-Za-z0-9_-]{43}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
export function AccesoWhatsappD016(){
 const started=useRef(false);
 const mounted=useRef(false);
 const [message,setMessage]=useState('Verificando tu enlace privado…');
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
   setMessage('El enlace no está disponible. Pedí otro por el WhatsApp de Cotironda.');
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
    window.location.replace('/piloto/v2/rondas/'+encodeURIComponent(ronda)+'/whatsapp');
   }catch{
    if(mounted.current)setMessage('Este enlace venció o no pudo verificarse. Pedí uno nuevo por WhatsApp.');
   }
  })();
  return ()=>{mounted.current=false};
 },[]);
 return <p role="status" aria-live="polite">{message}</p>;
}
