import { redirect } from 'next/navigation';
import { clienteSupabaseServidor, entornoAuthConfigurado } from '@/lib/supabase/server';
import { FormularioEmpresa } from './formulario';
export const dynamic='force-dynamic';
export default async function Alta(){
  if(!entornoAuthConfigurado())return <main className="panel"><h1>Registro todavía deshabilitado</h1><p>Primero debemos configurar y auditar una base Supabase exclusiva de Cotironda.</p></main>;
  const auth=await clienteSupabaseServidor();
  const {data:{user},error}=await auth.auth.getUser();
  if(error||!user) redirect('/ingresar');
  return <main className="panel"><span className="eyebrow">TU EMPRESA</span><h1>Crear empresa</h1><p>Configurá tu perfil como comprador o proveedor. No se enviarán invitaciones hasta confirmar el catálogo y la zona.</p>
    {process.env.COTIRONDA_REGISTRATION_ENABLED==='true'?<FormularioEmpresa/>:<div className="notice">El registro permanece deshabilitado hasta completar la auditoría de integración.</div>}
  </main>;
}
