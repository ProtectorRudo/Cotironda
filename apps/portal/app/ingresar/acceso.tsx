'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { clienteSupabaseNavegador } from '@/lib/supabase/browser';

export function Acceso(){
  const router=useRouter();
  const [email,setEmail]=useState(''),[password,setPassword]=useState('');
  const [busy,setBusy]=useState(false),[mensaje,setMensaje]=useState('');
  async function accion(mode:'login'|'signup'){
    if(busy)return;
    if(!email.includes('@') || password.length<8){
      setMensaje('Ingresá un correo válido y una contraseña de al menos 8 caracteres.');
      return;
    }
    setBusy(true); setMensaje('');
    const supabase=clienteSupabaseNavegador();
    if(!supabase){setMensaje('Servicio no disponible.');setBusy(false);return;}
    try{
      if(mode==='signup'){
        const {error}=await supabase.auth.signUp({email,password});
        setMensaje(error?'No se pudo crear la cuenta. Revisá los datos.':'Revisá tu correo para confirmar tu cuenta antes de ingresar.');
      }else{
        const {error}=await supabase.auth.signInWithPassword({email,password});
        if(error) setMensaje('No se pudo ingresar. Revisá los datos o verificá el correo.');
        else {router.push('/alta');router.refresh();}
      }
    }catch{setMensaje('Error de conexión. Probá nuevamente.');}
    finally{setBusy(false);}
  }
  function ingresar(e:FormEvent<HTMLFormElement>){e.preventDefault();void accion('login');}
  return <form onSubmit={ingresar}>
    <label htmlFor="email">Correo electrónico</label><input id="email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" maxLength={254}/>
    <label htmlFor="pass">Contraseña</label><input id="pass" type="password" required value={password} onChange={e=>setPassword(e.target.value)} minLength={8} autoComplete="current-password"/>
    <div className="inline-actions"><button type="submit" disabled={busy}>Ingresar</button><button type="button" className="outline" disabled={busy} onClick={()=>void accion('signup')}>Crear cuenta</button></div>
    {mensaje&&<p className="feedback" role="status">{mensaje}</p>}
    <p className="muted">Solo para pruebas con usuarios autorizados. Nunca compartas contraseñas.</p>
  </form>;
}
