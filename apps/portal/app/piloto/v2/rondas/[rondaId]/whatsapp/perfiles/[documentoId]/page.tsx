import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import Link from 'next/link';
import {consultarPerfilComercialWhatsappD022,puertaWhatsappPortalD016}
 from '@/lib/piloto-v2-d016-http';
import type {PerfilComercialD022}
 from '../../../../../../../../../../src/server/v2-d022-perfil-comercial.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;

/** Fallback SSR de D022: funciona aun si el javascript del modal no arranca.
 * Reutiliza EXACTAMENTE la RPC autorizada; nunca confía en un supplier_key del navegador.
 */
export default async function PerfilProveedorD022({
 params
}:{params:Promise<{rondaId:string;documentoId:string}>}){
 const {rondaId,documentoId}=await params;
 if(!UUID.test(rondaId)||!UUID.test(documentoId)||
  !puertaWhatsappPortalD016(process.env))notFound();
 const cookie=(await headers()).get('cookie')??'';
 // Sin HTTP externo, sin tokens en la URL, sin remitir la cookie a otro origen.
 const internal=new Request('https://app.cotironda.com/api/piloto/v2/rondas/'+
  encodeURIComponent(rondaId)+'/perfiles-whatsapp/'+encodeURIComponent(documentoId),{
   method:'GET',headers:{cookie}
  });
 const result=await consultarPerfilComercialWhatsappD022(internal,rondaId,documentoId);
 if(!result.ok)notFound();
 const perfil:PerfilComercialD022=await result.json();
 if(perfil.estado!=='perfil_comercial_autorizado'||!perfil.comercio)notFound();
 const base='/api/piloto/v2/rondas/'+encodeURIComponent(rondaId)+
  '/perfiles-whatsapp/'+encodeURIComponent(documentoId);
 const regreso='/piloto/v2/rondas/'+encodeURIComponent(rondaId)+'/whatsapp';
 return <main className="panel coti-clean coti-buyer-portal coti-supplier-profile-page">
  <Link className="coti-back-link" href={regreso}>← Volver a la cotización</Link>
  <section className="coti-supplier-profile" aria-label={'Perfil comercial de '+perfil.comercio}>
   <div className="coti-profile-brand">
    {perfil.fotoDisponible?
     <img src={base+'/foto'} className="coti-profile-photo"
      alt={'Foto de '+perfil.comercio} referrerPolicy="no-referrer"/>:
     <span className="coti-profile-placeholder" aria-hidden="true">
      {(perfil.comercio[0]??'C').toLocaleUpperCase('es-AR')}
     </span>}
    <div><h1>{perfil.comercio.replace(/\\s*·\\s*prueba\\s*$/iu,'')}</h1>
     <p>{perfil.rubro??'Rubro no informado'}</p></div>
   </div>
   <dl className="coti-profile-fields">
    <div><dt>Dirección</dt><dd>{perfil.direccion??'No informada'}</dd></div>
    <div><dt>Localidad</dt><dd>{perfil.localidad??'No informada'}</dd></div>
   </dl>
   <nav className="coti-profile-actions" aria-label="Contacto y ubicación">
    {perfil.whatsappUrl?
     <a className="coti-profile-whatsapp" href={perfil.whatsappUrl}
      rel="noopener noreferrer" target="_blank">Consultar por WhatsApp</a>:
     <p className="coti-profile-unavailable">WhatsApp comercial no informado</p>}
    {perfil.mapsUrl&&
     <a className="coti-profile-maps" href={perfil.mapsUrl}
      rel="noopener noreferrer" target="_blank">Ver ubicación en Google Maps</a>}
   </nav>
   <p className="coti-profile-disclaimer">El mensaje de WhatsApp se abre listo para revisar.
    Solo se envía si decidís hacerlo.</p>
  </section>
 </main>;
}
