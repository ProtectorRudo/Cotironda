'use client';
import {useEffect,useRef,useState} from 'react';
import type {PerfilComercialD022}
 from '../../../../../../../../src/server/v2-d022-perfil-comercial.ts';

export function PerfilComercialWhatsappD022({
 rondaId,documentoId,nombre,onClose
}:{rondaId:string;documentoId:string;nombre:string;onClose:()=>void}){
 const [perfil,setPerfil]=useState<PerfilComercialD022|null>(null);
 const [error,setError]=useState(false);
 const [loading,setLoading]=useState(true);
 const [fotoError,setFotoError]=useState(false);
 const closeRef=useRef<HTMLButtonElement>(null);
 const base='/api/piloto/v2/rondas/'+encodeURIComponent(rondaId)+
  '/perfiles-whatsapp/'+encodeURIComponent(documentoId);
 useEffect(()=>{
  closeRef.current?.focus();
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};
  document.addEventListener('keydown',onKey);
  return ()=>document.removeEventListener('keydown',onKey);
 },[onClose]);
 useEffect(()=>{
  let active=true;
  const controller=new AbortController();
  void (async()=>{
   try{
    const res=await fetch(base,{
     method:'GET',cache:'no-store',credentials:'same-origin',
     signal:controller.signal
    });
    if(!res.ok)throw Error('unavailable');
    const data:PerfilComercialD022=await res.json();
    if(data.estado!=='perfil_comercial_autorizado'||
     typeof data.comercio!=='string')throw Error('invalid');
    if(active)setPerfil(data);
   }catch{if(active)setError(true)}
   finally{if(active)setLoading(false)}
  })();
  return ()=>{active=false;controller.abort()};
 },[base]);
 const titulo=perfil?.comercio??nombre;
 return <div className="coti-profile-overlay">
  <section className="coti-supplier-profile" role="dialog"
   aria-modal="true" aria-label={'Perfil comercial de '+nombre}>
   <button ref={closeRef} type="button" onClick={onClose}
    className="coti-profile-close" aria-label="Cerrar perfil">×</button>
   {loading?<p role="status">Cargando perfil del negocio…</p>:
    error||!perfil?<p role="alert">No pudimos abrir la ficha de este negocio.</p>:
    <>
     <div className="coti-profile-brand">
      {perfil.fotoDisponible&&!fotoError?
       <img className="coti-profile-photo" src={base+'/foto'}
        onError={()=>setFotoError(true)} alt={'Foto de '+titulo}
        referrerPolicy="no-referrer"/>:
       <span className="coti-profile-placeholder" aria-hidden="true">
        {(titulo[0]??'C').toLocaleUpperCase('es-AR')}
       </span>}
      <div>
       <h2>{titulo.replace(/\s*·\s*prueba\s*$/iu,'')}</h2>
       <p>{perfil.rubro??'Rubro no informado'}</p>
      </div>
     </div>
     <dl className="coti-profile-fields">
      <div><dt>Dirección</dt>
       <dd>{perfil.direccion??'No informada'}</dd></div>
      <div><dt>Localidad</dt>
       <dd>{perfil.localidad??'No informada'}</dd></div>
     </dl>
     <nav aria-label="Contacto y ubicación del negocio" className="coti-profile-actions">
      {perfil.whatsappUrl?
       <a href={perfil.whatsappUrl} target="_blank" rel="noopener noreferrer"
        className="coti-profile-whatsapp">Consultar por WhatsApp</a>:
       <span className="coti-profile-unavailable">WhatsApp comercial no informado</span>}
      {perfil.mapsUrl&&
       <a href={perfil.mapsUrl} target="_blank" rel="noopener noreferrer"
        className="coti-profile-maps">Ver ubicación en Google Maps</a>}
     </nav>
     <p className="coti-profile-disclaimer">
      El mensaje de WhatsApp está preparado para que lo revises y lo envíes vos.
     </p>
    </>}
  </section>
 </div>;
}
