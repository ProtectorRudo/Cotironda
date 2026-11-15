import {notFound} from 'next/navigation';
import {puertaWhatsappPortalD016} from '@/lib/piloto-v2-d016-http';
import {DetalleHistoricoD017} from './detalle-historico';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;

export default async function CotizacionDeMiHistorial(
 {params}:{params:Promise<{rondaId:string}>}
){
 const {rondaId}=await params;
 if(!UUID.test(rondaId)||!puertaWhatsappPortalD016(process.env))notFound();
 return <main className="coti-profile-shell">
  <a className="coti-back-link" href="/piloto/v2/mi-cotironda">← Volver a mis cotizaciones</a>
  <DetalleHistoricoD017 rondaId={rondaId}/>
 </main>;
}
