import { redirect } from 'next/navigation';
import { clienteSupabaseServidor, entornoAuthConfigurado, entornoAuthSoloIngresoPreview } from '@/lib/supabase/server';
import { CerrarSesionPrueba } from './cerrar-sesion-prueba';
import { AuditoriaSeguridadSesion } from './auditoria-seguridad-sesion';
import { AuditoriaRegistroAuth } from './auditoria-registro-auth';
import { COTIRONDA_DEV_REF } from '../../../../src/server/portal-entorno.ts';
import { FormularioEmpresa } from './formulario';
export const dynamic='force-dynamic';
export default async function Alta(){
  if(!entornoAuthConfigurado())return <main className="panel"><h1>Registro todavía deshabilitado</h1><p>Primero debemos configurar y auditar una base Supabase exclusiva de Cotironda.</p></main>;
  const auth=await clienteSupabaseServidor();
  const {data:{user},error}=await auth.auth.getUser();
  if(error||!user) redirect('/ingresar');
  // Auth real de ensayo, pero SIN exponer el formulario ni la RPC comercial.
  if(entornoAuthSoloIngresoPreview()){
    if(!user.email_confirmed_at||user.is_anonymous)redirect('/ingresar');
    return <main className="panel">
      <span className="eyebrow">COTIRONDA · PRUEBA DE SESIÓN</span>
      <h1>Sesión de prueba activa</h1>
      <p>La identidad fue verificada por Supabase Auth desde el portal Next.js.
      El registro de empresas y las cargas documentales siguen deshabilitados.</p>
      <CerrarSesionPrueba/>
      <AuditoriaSeguridadSesion projectRef={COTIRONDA_DEV_REF}/>
      <AuditoriaRegistroAuth/>
    </main>;
  }
  return <main className="panel"><span className="eyebrow">TU EMPRESA</span><h1>Crear empresa</h1><p>Configurá tu perfil como comprador o proveedor. No se enviarán invitaciones hasta confirmar el catálogo y la zona.</p>
    {entornoAuthConfigurado()?<FormularioEmpresa/>:<div className="notice">El registro permanece deshabilitado hasta completar la auditoría de integración.</div>}
  </main>;
}
