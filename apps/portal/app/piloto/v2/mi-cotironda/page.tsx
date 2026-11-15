import {notFound} from 'next/navigation';
import {puertaWhatsappPortalD016} from '@/lib/piloto-v2-d016-http';
import {HistorialWhatsappD017} from './historial-whatsapp';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;

export default function MiCotironda(){
 if(!puertaWhatsappPortalD016(process.env))notFound();
 return <main className="coti-profile-shell">
  <header className="coti-profile-heading">
   <span className="coti-eyebrow">TU ESPACIO DE COMPRAS</span>
   <h1>Mi Cotironda</h1>
   <p>Todos tus pedidos en un solo lugar. Volvé a consultar tus cotizaciones cuando quieras.</p>
  </header>
  <HistorialWhatsappD017/>
 </main>;
}
