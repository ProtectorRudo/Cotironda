import {notFound} from 'next/navigation';
import {puertaWhatsappPortalD016} from '@/lib/piloto-v2-d016-http';
import {AccesoWhatsappD016} from './acceso-whatsapp-client';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export default function AccesoDesdeWhatsappD016(){
 if(!puertaWhatsappPortalD016(process.env))notFound();
 return <main className="panel">
  <span className="eyebrow">COTIRONDA · ACCESO PRIVADO</span>
  <h1>Tu pedido de materiales</h1>
  <AccesoWhatsappD016/>
 </main>;
}
