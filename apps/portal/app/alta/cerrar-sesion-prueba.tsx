'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {clienteSupabaseNavegador} from '@/lib/supabase/browser';

/** Cierre global exclusivo de cuentas dedicadas de ensayo. */
export function CerrarSesionPrueba(){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function cerrar(){
    if(busy)return;
    setBusy(true);setError('');
    try{
      const auth=clienteSupabaseNavegador();
      if(!auth){setError('Autenticación no disponible.');return;}
      const {error:logoutError}=await auth.auth.signOut({scope:'global'});
      if(logoutError){setError('No se pudo cerrar la sesión. Revisá Auth.');return;}
      router.replace('/ingresar');
      router.refresh();
    }catch{setError('Error de conexión. La sesión puede seguir activa.');}
    finally{setBusy(false);}
  }
  return <div>
    <button type="button" disabled={busy} onClick={()=>void cerrar()}>
      {busy?'Cerrando...':'Cerrar sesión de prueba'}
    </button>
    {error&&<p className="feedback" role="status">{error}</p>}
    <p className="muted">La salida es global: termina las sesiones de esta cuenta en otros dispositivos.</p>
  </div>;
}
