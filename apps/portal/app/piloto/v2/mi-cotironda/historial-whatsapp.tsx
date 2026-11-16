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
 return <a className="coti-history-item"
  href={'/piloto/v2/mi-cotironda/cotizaciones/'+encodeURIComponent(r.rondaId)}>
  <div className="coti-history-date-icon" aria-hidden="true">
   <span>{new Date(r.fechaMs).toLocaleDateString('es-AR',{day:'2-digit',timeZone:'America/Argentina/Buenos_Aires'})}</span>
   <small>{new Date(r.fechaMs).toLocaleDateString('es-AR',{month:'short',timeZone:'America/Argentina/Buenos_Aires'})}</small>
  </div>
  <div className="coti-history-details">
   <div className="coti-history-mainline">
    <strong>Cotización del {date(r.fechaMs)}</strong>
    <span className={'coti-history-state '+(r.estado==='closed'?'closed':r.estado==='draft'?'draft':'active')}>
     {label(r.estado)}
    </span>
   </div>
   <p>{r.localidad||'Localidad no informada'} · {r.articulos} {r.articulos===1?'artículo solicitado':'artículos solicitados'}</p>
   <span className="coti-history-documents">
    {r.ofertasDisponibles?
     r.originales+' '+(r.originales===1?'presupuesto disponible':'presupuestos disponibles'):
     r.estado==='draft'?'Sin enviar a proveedores':
     'Archivo histórico · originales no habilitados'}
   </span>
  </div>
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
 const active=sent.filter(r=>r.estado==='prepared').length;
 const originals=sent.reduce((sum,r)=>sum+r.originales,0);
 return <section aria-label="Historial de cotizaciones">
  <div className="coti-profile-welcome">
   <div><span className="coti-eyebrow">BIENVENIDO A TU PORTAL</span>
    <h2>{data.nombre}</h2>
    <p>Consultá cada pedido y los presupuestos de los comercios que respondieron.</p>
   </div>
   <div>
    <button type="button" className="button outline" onClick={()=>void refresh()}>Actualizar</button>
    <button type="button" className="button outline"
     disabled={reissue==='sending'} onClick={()=>void sendNewAccess()}>
     {reissue==='sending'?'Enviando acceso…':'Enviar acceso a mi WhatsApp'}
    </button>
    {reissue==='accepted'&&<p role="status">WhatsApp aceptó el envío del nuevo enlace privado al número verificado de esta cuenta.</p>}
    {reissue==='error'&&<p role="alert">No se pudo confirmar el envío. No se reenviará automáticamente para evitar duplicados.</p>}
   </div>
  </div>
  <div className="coti-profile-stats">
   <div><span>Cotizaciones</span><strong>{sent.length}</strong></div>
   <div><span>En curso</span><strong>{active}</strong></div>
   <div><span>Presupuestos disponibles</span><strong>{originals}</strong></div>
  </div>
  <section className="coti-history-group" aria-label="Tus cotizaciones">
   <div className="coti-history-title"><h2>Mis cotizaciones</h2>
    <span>Más recientes primero</span></div>
   {sent.length?sent.map(r=><Row key={r.rondaId} r={r}/>):
    <div className="coti-profile-message">Todavía no tenés cotizaciones enviadas.</div>}
  </section>
  {drafts.length>0&&<section className="coti-history-group" aria-label="Borradores históricos">
   <div className="coti-history-title"><h2>Borradores</h2>
    <span>No enviados a proveedores</span></div>
   {drafts.map(r=><Row key={r.rondaId} r={r}/>)}
  </section>}
  <p className="coti-profile-privacy">Tu historial se conserva aunque venza el enlace de acceso. Cada presupuesto original requiere autorización vigente.</p>
 </section>;
}
