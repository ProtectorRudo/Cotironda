'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';

// Estado efímero de navegación; no guardamos documentos ni identidad en storage.
let ultimaPosicionHistorial=0;
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
 return <Link className={'coti-history-item '+(r.estado==='prepared'?'coti-history-active':'')}
  href={'/piloto/v2/mi-cotironda/cotizaciones/'+encodeURIComponent(r.rondaId)}
  onClick={()=>{ultimaPosicionHistorial=window.scrollY}}
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

  </div>
  <span className={'coti-history-state '+(r.estado==='closed'?'closed':r.estado==='draft'?'draft':'active')}>{label(r.estado)}</span>
  <span className="coti-history-chevron" aria-hidden="true">›</span>
 </Link>;
}
function CompartirHistorialV2(){
 const [expanded,setExpanded]=useState(false);
 const loaded=useRef(false);
 const [link,setLink]=useState('');
 const [originalsEnabled,setOriginalsEnabled]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 async function act(action:'get'|'create'|'revoke'|'enable-originals'){
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   const res=await fetch(endpoint+'/compartir',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'x-cotironda-share':'1'},body:action});
   if(!res.ok)throw Error('denied');
   const d=await res.json();
   if(d.state==='active'&&typeof d.url==='string'&&d.url.startsWith(window.location.origin+'/piloto/v2/compartido#')){setLink(d.url);setOriginalsEnabled(d.originalsEnabled===true)}
   else if(d.state==='inactive'){setLink('');setOriginalsEnabled(false)}
   else throw Error('invalid');
   loaded.current=true;
   if(action==='revoke')setMessage('Enlace desactivado.');
   if(action==='enable-originals'&&d.originalsEnabled===true)setMessage('Descargas habilitadas en el mismo enlace.');
  }catch{setMessage('No se pudo gestionar el enlace. Volvé a intentar.')}
  finally{setBusy(false)}
 }
 function toggle(){
  const next=!expanded;
  setExpanded(next);
  if(next&&!loaded.current&&!busy)void act('get');
 }
 async function copy(){
  try{await navigator.clipboard.writeText(link);setMessage('Enlace copiado.')}catch{setMessage('Seleccioná y copiá el enlace de abajo.')}
 }
 return <div className="coti-share-menu">
  <button type="button" aria-expanded={expanded} aria-controls="coti-share-controls" onClick={toggle}>Compartir cotizaciones <span aria-hidden="true">{expanded?'−':'›'}</span></button>
  {expanded&&<div id="coti-share-controls" className="coti-share-controls">
   <p>Solo lectura, sin registro. {link&&!originalsEnabled?'Este enlace muestra resúmenes. Podés habilitar la descarga de originales autorizados.':'Incluye nuevos presupuestos y descarga de originales autorizados.'}</p>
   {busy&&!loaded.current?<p role="status">Consultando enlace…</p>:!loaded.current?<button type="button" disabled={busy} onClick={()=>void act('get')}>Volver a intentar</button>:!link?<button type="button" disabled={busy} onClick={()=>void act('create')}>Crear enlace compartido</button>:<>
   <input aria-label="Enlace compartido" readOnly value={link} onFocus={e=>e.currentTarget.select()}/>
   {!originalsEnabled&&<button type="button" disabled={busy} onClick={()=>void act('enable-originals')}>Habilitar descarga de originales</button>}
   <button type="button" disabled={busy} onClick={()=>void copy()}>Copiar enlace</button>
   {'share' in navigator&&<button type="button" disabled={busy} onClick={()=>void navigator.share({title:'Cotizaciones compartidas',url:link}).catch(()=>{})}>Compartir</button>}
   <button type="button" className="button outline" disabled={busy} onClick={()=>void act('revoke')}>Desactivar enlace</button>
  </>}
  {message&&<p role="status">{message}</p>}
  </div>}
 </div>;
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
 useEffect(()=>{
  if(!loading&&!error&&data&&ultimaPosicionHistorial>0)
   window.requestAnimationFrame(()=>window.scrollTo(0,ultimaPosicionHistorial));
 },[loading,error,data]);
 if(loading)return <div role="status" aria-label="Cargando historial" className="coti-skeleton-stack">
  <div className="coti-skeleton-line short"/>
  <div className="coti-skeleton-row"/><div className="coti-skeleton-row"/>
  <span className="coti-screen-reader">Verificando tu historial privado…</span>
 </div>;
 if(error)return <div role="alert" className="coti-profile-message">
  <p>Este navegador todavía no tiene una sesión privada para tu historial.</p>
  <p>Podés pedir que Cotironda envíe un acceso nuevo al WhatsApp ya verificado del comprador, sin registrarte de nuevo.</p>
  <button type="button" onClick={()=>void refresh()}>Volver a intentar</button>
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
 // Los borradores técnicos no fueron pedidos explícitamente por el comprador.
 const active=sent.filter(r=>r.estado==='prepared');
 const history=sent.filter(r=>r.estado!=='prepared');
 return <section className="coti-clean-history" aria-label="Historial de cotizaciones">
  <div className="coti-clean-profilebar">
   <span>{/·\s*prueba\s*$/iu.test(data.nombre)?'Portal privado':data.nombre}</span>
   <details className="coti-clean-account-tools">
    <summary aria-label="Opciones de acceso">Opciones</summary>
    <div className="coti-clean-account-menu">
     <button type="button" onClick={()=>void refresh()}>Actualizar historial</button>
     <CompartirHistorialV2/>
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
   {history.some(r=>r.estado==='closed'&&!r.ofertasDisponibles)&&
    <p className="coti-history-archive">En algunas cotizaciones anteriores, los originales todavía no están habilitados.</p>}
  </section>
  <p className="coti-profile-privacy">Tu historial permanece disponible al renovar el acceso privado.</p>
 </section>;
}
