import {notFound} from 'next/navigation';
import {puertaWhatsappPortalD016} from '@/lib/piloto-v2-d016-http';
import {AccesoWhatsappD016} from './acceso-whatsapp-client';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;

/** No mostrar un 404 confuso al responsable del piloto, ni filtrar datos.
 * Preview con acceso D016 OFF: pantalla informativa sin APIs privadas.
 * Producción y otros entornos con gate OFF: 404, sin rutas abiertas.
 */
export default function AccesoDesdeWhatsappD016(){
 const acceso=puertaWhatsappPortalD016(process.env);
 if(!acceso){
  if(process.env.VERCEL_ENV!=='preview')notFound();
  return <main className="panel">
   <span className="eyebrow">COTIRONDA · PILOTO V2</span>
   <h1>Acceso por WhatsApp en preparación</h1>
   <p>El portal de pruebas está publicado. La consulta privada de presupuestos
    permanece deshabilitada hasta completar las verificaciones de seguridad.</p>
   <p>Los presupuestos originales no se muestran sin una sesión válida
    y las autorizaciones correspondientes.</p>
  </main>;
 }
 return <main className="panel">
  <span className="eyebrow">COTIRONDA · ACCESO PRIVADO</span>
  <h1>Tu pedido de materiales</h1>
  <AccesoWhatsappD016/>
 </main>;
}
