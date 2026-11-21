import {notFound} from 'next/navigation';
import {puertaWhatsappPortalD016} from '@/lib/piloto-v2-d016-http';
import {HistorialWhatsappD017} from './historial-whatsapp';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;

export default function MiCotironda(){
 if(!puertaWhatsappPortalD016(process.env))notFound();
 return <main className="coti-profile-shell coti-clean">
  <header className="coti-profile-heading">
   <h1>Mis cotizaciones</h1>
  </header>
  <HistorialWhatsappD017/>
 </main>;
}
