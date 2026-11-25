import {notFound} from 'next/navigation';
import {puertaWhatsappPortalD016} from '@/lib/piloto-v2-d016-http';
import {HistorialCompartidoV2} from './historial-compartido';
import type {Metadata} from 'next';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export const metadata:Metadata={title:'Cotizaciones compartidas · Cotironda',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function Compartido(){
 if(!puertaWhatsappPortalD016(process.env))notFound();
 return <main className="coti-profile-shell coti-clean"><header className="coti-profile-heading"><h1>Cotizaciones compartidas</h1></header><HistorialCompartidoV2/></main>;
}
