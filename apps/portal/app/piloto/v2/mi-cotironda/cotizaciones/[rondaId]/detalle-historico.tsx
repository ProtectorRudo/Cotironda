'use client';
import {useEffect,useState} from 'react';
import type {HistorialCompradorD017,RondaHistorialD017}
 from '../../../../../../../../src/server/v2-d017-historial-comprador.ts';
import {RespuestasWhatsappD016}
 from '../../../rondas/[rondaId]/whatsapp/respuestas-whatsapp';

export function DetalleHistoricoD017({rondaId}:{rondaId:string}){
 const [ronda,setRonda]=useState<RondaHistorialD017|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  void (async()=>{
   try{
    const res=await fetch('/api/piloto/v2/mi-cotironda',{
     method:'GET',cache:'no-store',credentials:'same-origin',
     signal:AbortSignal.timeout(15_000)
    });
    if(!res.ok)throw Error('denied');
    const data:HistorialCompradorD017=await res.json();
    if(data.estado!=='historial_autorizado'||!Array.isArray(data.cotizaciones))
     throw Error('invalid');
    const selected=data.cotizaciones.find(q=>q.rondaId===rondaId);
    if(!selected)throw Error('not_found');
    if(active)setRonda(selected);
   }catch{if(active)setError('No pudimos verificar esta cotización de tu historial.')}
   finally{if(active)setLoading(false)}
  })();
  return ()=>{active=false};
 },[rondaId]);
 if(loading)return <div role="status" aria-label="Abriendo tu cotización" className="coti-skeleton-stack">
  <div className="coti-skeleton-line"/><div className="coti-skeleton-line short"/>
  <div className="coti-skeleton-row"/><div className="coti-skeleton-row"/>
 </div>;
 if(error||!ronda)return <p role="alert" className="coti-profile-message">{error||'Cotización no disponible.'}</p>;
 const date=new Date(ronda.fechaMs).toLocaleDateString('es-AR',{
  day:'2-digit',month:'2-digit',year:'numeric',
  timeZone:'America/Argentina/Buenos_Aires'
 });
 return <section aria-label={'Cotización del '+date}>
  <header className="coti-profile-heading coti-clean-detail-heading">
   <h1>Pedido del {date}</h1>
   <p>{ronda.localidad||'Localidad no informada'} · {ronda.articulos} {ronda.articulos===1?'material':'materiales'}</p>
  </header>
  {ronda.ofertasDisponibles?
   <RespuestasWhatsappD016 rondaId={ronda.rondaId}/>:
   <div className="coti-profile-message" role="status">
    <h2>{ronda.estado==='draft'?'Borrador sin enviar':'Cotización histórica'}</h2>
    <p>{ronda.estado==='draft'?
     'Este pedido figura como borrador. No hay presupuestos enviados para consultar.':
     'Conservamos este registro en tu historial, pero los originales de esta ronda anterior todavía no están habilitados para su consulta privada.'}</p>
   </div>}
 </section>;
}
