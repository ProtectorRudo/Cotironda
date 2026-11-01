import Link from 'next/link';
import {redirect} from 'next/navigation';
import {clienteSupabaseServidor,entornoAuthConfigurado}
 from '@/lib/supabase/server';
import {habilitarPantallaAltaWhatsAppD073}
 from '../../../../../src/server/supplier-whatsapp-link-http-d073.ts';
import {ActivarWhatsAppProveedor} from './activar-whatsapp';
import './proveedor-whatsapp.css';

export const dynamic='force-dynamic';
export const revalidate=0;
export const metadata={
 title:'Activar WhatsApp · Cotironda',
 description:'Recibí solicitudes de materiales directamente en tu WhatsApp'
};
type Org=Readonly<{id:string;name:string}>;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
export default async function PaginaWhatsAppProveedor(){
 const habilitado=habilitarPantallaAltaWhatsAppD073(process.env)&&
  entornoAuthConfigurado();
 if(!habilitado)return <main className="pw-shell">
  <section className="pw-card">
   <span className="pw-eyebrow">COTIRONDA · PROVEEDORES</span>
   <h1>Tu WhatsApp, tus cotizaciones.</h1>
   <p>Estamos preparando la activación segura para los primeros proveedores.
    Todavía no se reciben consultas comerciales reales.</p>
   <div className="pw-unavailable">Activación no habilitada en este entorno.</div>
   <Link href="/" className="pw-link">Volver al inicio</Link>
  </section>
 </main>;
 const supabase=await clienteSupabaseServidor();
 const {data:{user},error}=await supabase.auth.getUser();
 if(error||!user||!user.email_confirmed_at||user.is_anonymous)redirect('/ingresar');
 // RLS yields only own organizations; SQL D072 is the final Auth/session+
 // owner/manager guard on every emission. Browser never supplies rights.
 const {data, error:listingError}=await supabase.from('organizations')
  .select('id,display_name,organization_type,organization_members!inner(user_id,membership_role,status),supplier_profiles!inner(organization_id)')
  .eq('organization_members.user_id',user.id)
  .eq('organization_members.status','active')
  .in('organization_members.membership_role',['owner','manager'])
  .in('organization_type',['supplier','both']).limit(11);
 const organizations:Org[]=listingError||!Array.isArray(data)||data.length>10?
  []:data.filter(o=>typeof o.id==='string'&&UUID.test(o.id)&&
   typeof o.display_name==='string').map(o=>({id:o.id,name:o.display_name}));
 return <main className="pw-shell">
  <section className="pw-card">
   <span className="pw-eyebrow">COTIRONDA · PROVEEDORES</span>
   <h1>Activá tu WhatsApp y empezá a recibir consultas.</h1>
   <p>Tu negocio recibe pedidos de materiales de su rubro. Respondés con
    un mensaje, una foto o un presupuesto. Sin aprender otra plataforma.</p>
   {listingError||data?.length>10?
    <p className="pw-unavailable">No pudimos verificar tus empresas en este momento. Probá nuevamente más tarde.</p>:
    organizations.length===0?
    <div className="pw-unavailable">Todavía no encontramos una empresa proveedora a tu cargo.
     <p>Primero registrá o solicitá acceso a tu empresa.</p>
     <Link href="/alta" className="pw-link">Ir a mi empresa</Link>
    </div>:
    <ActivarWhatsAppProveedor organizaciones={organizations}/>}
   <div className="pw-steps">
    <p><strong>¿Cómo funciona?</strong></p>
    <p>1. Abrís WhatsApp desde el botón.</p>
    <p>2. Enviás el mensaje preparado desde el número del negocio.</p>
    <p>3. Cuando se habiliten las rondas, respondés las consultas por el mismo chat.</p>
   </div>
   <p className="pw-footnote">Activación voluntaria. Es gratis y sin comisiones.
    Podés dejar de recibir consultas escribiendo BAJA.</p>
  </section>
 </main>;
}
