'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {clienteSupabaseNavegador} from '@/lib/supabase/browser';

/** Modo de prueba SSO: admite solo login con cuentas Auth preexistentes. */
export function AccesoPrueba() {
  const router=useRouter();
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [mensaje,setMensaje]=useState('');

  async function ingresar(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy)return;
    if(!email.includes('@')||password.length<8){
      setMensaje('Revisá el correo y la contraseña de la cuenta de ensayo.');
      return;
    }
    setBusy(true);setMensaje('');
    try {
      const client=clienteSupabaseNavegador();
      if(!client){setMensaje('Autenticación de prueba no disponible.');return;}
      const {error}=await client.auth.signInWithPassword({email,password});
      if(error){setMensaje('No se pudo ingresar. Verificá la cuenta y el correo.');return;}
      router.replace('/alta');
      router.refresh();
    }catch{setMensaje('No se pudo conectar. Intentá nuevamente.');}
    finally{setPassword('');setBusy(false);}
  }

  return <form onSubmit={ingresar}>
    <div className="notice"><strong>Ingreso de prueba solamente.</strong> Solo para cuentas ya creadas y autorizadas. No se pueden crear cuentas nuevas ni registrar empresas desde este entorno.</div>
    <label htmlFor="email">Correo electrónico</label>
    <input id="email" type="email" required maxLength={254} autoComplete="email"
      value={email} onChange={e=>setEmail(e.target.value)}/>
    <label htmlFor="pass">Contraseña</label>
    <input id="pass" type="password" required minLength={8} autoComplete="current-password"
      value={password} onChange={e=>setPassword(e.target.value)}/>
    <button type="submit" disabled={busy}>{busy?'Verificando...':'Ingresar a prueba'}</button>
    {mensaje&&<p className="feedback" role="status">{mensaje}</p>}
    <p className="muted">No compartas contraseñas ni capturas del formulario. Preview protegida con Vercel SSO.</p>
  </form>;
}
