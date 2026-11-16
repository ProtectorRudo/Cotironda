'use client';
import {useCallback,useEffect,useState} from 'react';
import type {HistorialCompradorD017,RondaHistorialD017}
 from '../../../../../../src/server/v2-d017-historial-comprador.ts';

const endpoint='/api/piloto/v2/mi-cotironda';
function date(ms:number){
 return new Date(ms).toLocaleDateString('es-AR',{
  day:'numeric',month:'long',year:'numeric',
  timeZone:'America/Argentina/Buenos_Aires'
 });
}
function label(state:RondaHistorialD017['estado']){
 return state==='closed'?'Cerrada':state==='prepared'?'En curso':'Borrador';
}
function Row({r}:{r:RondaHistorialD017}){
 const dia=new Date(r.fechaMs);
 const ofertas=r.ofertasDisponibles&&r.originales>0;
 return <a className={'coti-history-item '+(r.estado==='prepared'?'coti-history-active':'')}
  href={'/piloto/v2/mi-cotironda/cotizaciones/'+encodeURIComponent(r.rondaId)}
  aria-label={'Cotización del '+date(r.fechaMs)+', '+label(r.estado)+
   (ofertas?', '+r.originales+' presupuestos recibidos':'')}>
  <div className="coti-history-date-icon" aria-hidden="true">
   <span>{dia.toLocaleDateString('es-AR',{day:'2-digit',timeZone:'America/Argentina/Buenos_Aires'})}</span>
   <small>{dia.toLocaleDateString('es-AR',{month:'short',timeZone:'America/Argentina/Buenos_Aires'})}</small>
  </div>
  <div className="coti-history-details">
   <div className="coti-history-mainline">
    <strong>{date(r.fechaMs)}</strong>
   </div>
   <p>{r.localidad||'Localidad no informada'} · {r.articulos} {r.articulos===1?'material':'materiales'}</p>
   {ofertas&&<span className="coti-history-documents">
    {r.originales} {r.originales===1?'presupuesto recibido':'presupuestos recibidos'}
   </span>}
   {r.estado==='draft'&&<span className="coti-history-documents">Sin enviar a proveedores</span>}
   {r.estado==='closed'&&!ofertas&&<span className="coti-history-archive">Archivo histórico · originales no habilitados</span>}
  </div>
  <span className={'coti-history-state '+(r.estado==='closed'?'closed':r.estado==='draft'?'draft':'active')}>{label(r.estado)}</span>
  <span className="coti-history-chevron" aria-hidden="true">›</span>
 </a>;
}
export function HistorialWhatsappD017(){
 const [data,setData]=useState<HistorialCompradorD017|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [reissue,setReissue]=useState<'idle'|'sending'|'accepted'|'error'>('idle');
 const [recovery,setRecovery]=useState<'idle'|'sending'|'submitted'|'error'>('idle');
 const refresh=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const res=await fetch(endpoint,{cache:'no-store',credentials:'same-origin',
    signal:AbortSignal.timeout(15_000)});
   if(!res.ok)throw Error('denied');
   const parsed:HistorialCompradorD017=await res.json();
   if(parsed.estado!=='historial_autorizado'||!Array.isArray(parsed.cotizaciones))
    throw Error('invalid');
   setData(parsed);
  }catch{
   setData(null);
   setError('No pudimos abrir tu historial privado. Si tu sesión venció, ingresá de nuevo con el enlace que recibís por WhatsApp.');
  }finally{setLoading(false)}
 },[]);
 async function sendNewAccess(){
  if(reissue==='sending')return;
  setReissue('sending');
  try{
   const result=await fetch('/api/piloto/v2/mi-cotironda/enviar-acceso',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'x-cotironda-reissue':'1'},
    signal:AbortSignal.timeout(20000)
   });
   const body:unknown=await result.json().catch(()=>null);
   setReissue(result.ok&&body&&typeof body==='object'&&
     (body as Record<string,unknown>).state==='sent'?'accepted':'error');
  }catch{setReissue('error')}
 }
 async function recoverWithoutSession(){
  if(recovery!=='idle'&&recovery!=='error')return;
  setRecovery('sending');
  try{
   const res=await fetch('/api/piloto/v2/acceso/recuperar',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'x-cotironda-reissue':'1'},
    signal:AbortSignal.timeout(20_000)
   });
   setRecovery(res.status===202?'submitted':'error');
  }catch{setRecovery('error')}
 }
 useEffect(()=>{void refresh()},[refresh]);
 if(loading)return <p role="status" className="coti-profile-message">Verificando tu historial privado…</p>;
 if(error)return <div role="alert" className="coti-profile-message">
  <p>Este navegador todavía no tiene una sesión privada para tu historial.</p>
  <p>Podés pedir que Cotironda envíe un acceso nuevo al WhatsApp ya verificado del comprador, sin registrarte de nuevo.</p>
  <button type="button" className="button outline"
   disabled={recovery==='sending'||recovery==='submitted'}
   onClick={()=>void recoverWithoutSession()}>
   {recovery==='sending'?'Solicitando acceso…':'Recibir un nuevo enlace por WhatsApp'}
  </button>
  {recovery==='submitted'&&<p role="status">Solicitud procesada. Si la cuenta piloto está habilitada, el nuevo enlace llegará exclusivamente al WhatsApp registrado. Revisá ese chat.</p>}
  {recovery==='error'&&<p role="status">No se pudo procesar ahora. No enviaremos mensajes repetidos automáticamente.</p>}
  <p><a href="/piloto/v2/acceso">Volver al acceso de WhatsApp</a></p>
 </div>;
 if(!data)return null;
 const sent=data.cotizaciones.filter(r=>r.estado!=='draft');
 const drafts=data.cotizaciones.filter(r=>r.estado==='draft');
 const active=sent.filter(r=>r.estado==='prepared');
 const history=sent.filter(r=>r.estado!=='prepared');
 return <section className="coti-clean-history" aria-label="Historial de cotizaciones">
  <div className="coti-clean-profilebar">
   <span>{data.nombre}</span>
   <details className="coti-clean-account-tools">
    <summary aria-label="Opciones de acceso">Opciones</summary>
    <div className="coti-clean-account-menu">
     <button type="button" onClick={()=>void refresh()}>Actualizar historial</button>
     <button type="button" disabled={reissue==='sending'} onClick={()=>void sendNewAccess()}>
      {reissue==='sending'?'Enviando…':'Enviar acceso a mi WhatsApp'}
     </button>
     {reissue==='accepted'&&<p role="status">Acceso enviado al WhatsApp registrado.</p>}
     {reissue==='error'&&<p role="alert">No se pudo confirmar el envío.</p>}
    </div>
   </details>
  </div>
  {active.length>0&&<section className="coti-history-group" aria-label="Cotizaciones en curso">
   <div className="coti-history-title"><h2>En curso</h2></div>
   {active.map(r=><Row key={r.rondaId} r={r}/>)}
  </section>}
  <section className="coti-history-group" aria-label="Tus cotizaciones anteriores">
   <div className="coti-history-title"><h2>Historial</h2></div>
   {history.length?history.map(r=><Row key={r.rondaId} r={r}/>):
    <p className="coti-clean-muted">No hay cotizaciones anteriores.</p>}
  </section>
  {drafts.length>0&&<details className="coti-clean-drafts">
   <summary>Borradores ({drafts.length})</summary>
   {drafts.map(r=><Row key={r.rondaId} r={r}/>)}
  </details>}
  <p className="coti-profile-privacy">Tu historial permanece disponible al renovar el acceso privado.</p>
 </section>;
}
