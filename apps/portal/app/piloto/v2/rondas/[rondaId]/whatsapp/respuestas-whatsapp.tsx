'use client';
/** Cotironda D016: sesión HttpOnly, no OTP ni JWT en JavaScript. */
import {useCallback,useEffect,useRef,useState} from 'react';
import type {CatalogoRespuestasV2} from '../../../../../../../../src/server/v2-03-catalogo-respondedores.ts';
import type {InformeFinalD016}
 from '../../../../../../../../src/server/v2-d016-informe-final.ts';
import {nombreDescargaOriginalV2} from '../../../../../../lib/piloto-v2-nombre-descarga.ts';
import {seleccionarAnalisisPendientesV2,registrarIntentosAnalisisV2,
 type IntentoAnalisisV2}
 from '../../../../../../lib/piloto-v2-reintento-analisis.ts';

export function RespuestasWhatsappD016({rondaId}:{rondaId:string}){
 const [catalog,setCatalog]=useState<CatalogoRespuestasV2|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [cerrada,setCerrada]=useState(false);
 const version=useRef(0);
 const running=useRef<number|null>(null);
 // MISMA recuperación V2-12 usada por el portal con JWT:
 // hasta tres intentos por original, mínimo seis minutos entre intentos.
 const historialAnalisis=useRef(new Map<string,IntentoAnalisisV2>());
 const analysisRunning=useRef(false);
 const [analizando,setAnalizando]=useState(false);
 const [informe,setInforme]=useState<InformeFinalD016|null>(null);
 const informeRunning=useRef(false);
 const url='/api/piloto/v2/rondas/'+encodeURIComponent(rondaId);
 const refresh=useCallback(async(silent=false)=>{
  if(cerrada)return;
  const identity=version.current;
  if(running.current===identity)return;
  running.current=identity;
  if(!silent)setBusy(true);
  try{
   const res=await fetch(url+'/respuestas-whatsapp',{
    method:'GET',cache:'no-store',credentials:'same-origin',
    signal:AbortSignal.timeout(15_000)
   });
   if(identity!==version.current)return;
   if(!res.ok){setCatalog(null);throw Error('denied')}
   const body:CatalogoRespuestasV2=await res.json();
   if(identity!==version.current)return;
   if(body.estado!=='cotizaciones_recibidas'||!Array.isArray(body.respuestas))
    throw Error('catalog_invalid');
   setCatalog(body);setError('');
  }catch{
   if(identity===version.current){
    setCatalog(null);
    setError('No pudimos verificar el acceso a este pedido. Si venció, pedí otro enlace por WhatsApp.');
   }
  }finally{
   if(running.current===identity)running.current=null;
   if(identity===version.current){setLoading(false);if(!silent)setBusy(false)}
  }
 },[url,cerrada]);
 useEffect(()=>{
  void refresh();
  const timer=window.setInterval(()=>{
   if(document.visibilityState==='visible'&&running.current!==version.current)
    void refresh(true);
  },60_000);
  return ()=>{version.current++;window.clearInterval(timer)};
 },[refresh]);

 // Guía automática para CUALQUIER ronda o proveedor D016.
 // Una respuesta HTTP 202/no disponible se reintenta con la MISMA política
 // V2-12 que ya funciona en el portal autenticado por JWT. Sin WhatsApp,
 // sin nuevos permisos ni pasos para el cliente/proveedor.
 // La base decide el límite real (3/SHA, lease y revalidación de sesión).
 useEffect(()=>{
  if(cerrada||!catalog||analysisRunning.current||
     document.visibilityState!=='visible')return;
  const ahoraMs=Date.now();
  const pending=seleccionarAnalisisPendientesV2(
   catalog.respuestas,historialAnalisis.current,ahoraMs);
  if(pending.length===0)return;
  // Registrar ANTES de iniciar: el polling nunca duplica ejecuciones.
  registrarIntentosAnalisisV2(historialAnalisis.current,pending,ahoraMs);
  analysisRunning.current=true;
  const current=version.current;
  setAnalizando(true);
  void (async()=>{
   let changed=false;
   try{
    for(const documentoId of pending){
     if(current!==version.current||document.visibilityState!=='visible')break;
     try{
      const answer=await fetch(url+'/analisis-whatsapp/'+
       encodeURIComponent(documentoId),{
       method:'POST',credentials:'same-origin',cache:'no-store',
       headers:{'accept':'application/json'},
       signal:AbortSignal.timeout(55_000)
      });
      // HTTP 202 NO indica que la IA terminó: no marcarlo como resuelto.
      if(answer.status===200)changed=true;
      if([401,403,404].includes(answer.status))break;
     }catch{/* La fuente original no se borra ni se bloquea. */}
    }
   }finally{
    analysisRunning.current=false;
    if(current===version.current){
     setAnalizando(false);
     if(changed)void refresh(true);
    }
   }
  })();
 },[catalog,cerrada,url,refresh]);

 // El informe FINAL solo llega si PostgreSQL confirma que terminó la
 // ronda de dos días hábiles con calendario aprobado. No lo anticipamos.
 useEffect(()=>{
  if(cerrada||!catalog||informeRunning.current)return;
  let active=true;
  const identity=version.current;
  informeRunning.current=true;
  void (async()=>{
   try{
    const response=await fetch(url+'/informe-final-whatsapp',{
     method:'GET',cache:'no-store',credentials:'same-origin',
     signal:AbortSignal.timeout(15_000)
    });
    if(!active||identity!==version.current)return;
    if(response.status===202){setInforme(null);return}
    if(!response.ok){setInforme(null);return}
    const data:InformeFinalD016=await response.json();
    if(data.estado!=='informe_final_disponible'||
     !Array.isArray(data.comparacion)||data.documentos<0)return;
    setInforme(data);
   }catch{if(active&&identity===version.current)setInforme(null)}
   finally{informeRunning.current=false}
  })();
  return ()=>{active=false};
 },[catalog,cerrada,url]);

 async function download(doc:string){
  if(busy||!catalog)return;
  const identity=version.current;
  setBusy(true);setError('');
  try{
   const res=await fetch(url+'/originales-whatsapp/'+encodeURIComponent(doc),{
    method:'GET',credentials:'same-origin',cache:'no-store',
    signal:AbortSignal.timeout(25_000)
   });
   if(identity!==version.current)return;
   if(!res.ok)throw Error('unavailable');
   const bytes=await res.arrayBuffer();
   if(identity!==version.current)return;
   if(bytes.byteLength<1||bytes.byteLength>8388608)throw Error('size');
   const mime=res.headers.get('content-type');
   const link=URL.createObjectURL(new Blob([bytes],{
    type:mime??'application/octet-stream'
   }));
   const a=document.createElement('a');
   a.href=link;a.download=nombreDescargaOriginalV2(doc,mime);
   a.style.display='none';document.body.appendChild(a);a.click();a.remove();
   window.setTimeout(()=>URL.revokeObjectURL(link),30000);
  }catch{
   if(identity===version.current)
    setError('No está disponible el original. Cotironda protege cada descarga y vuelve a comprobar los permisos.');
  }finally{if(identity===version.current)setBusy(false)}
 }
 async function cerrarSesion(){
  if(busy)return;
  setBusy(true);setError('');
  try{
   const res=await fetch('/api/piloto/v2/acceso/salir',{
    method:'POST',cache:'no-store',credentials:'same-origin',
    signal:AbortSignal.timeout(15_000)
   });
   if(!res.ok)throw Error('logout_failed');
   version.current++;
   historialAnalisis.current.clear();
   setCatalog(null);setCerrada(true);
  }catch{setError('No pudimos cerrar tu sesión. Volvé a intentarlo.');}
  finally{setBusy(false)}
 }
 if(cerrada)return <p role="status">Tu sesión está cerrada. Podés pedir otro enlace por WhatsApp.</p>;
 if(loading)return <p role="status">Comprobando tu pedido…</p>;
 if(error&&!catalog)return <p role="alert">{error}</p>;
 return <section className="coti-buyer-dashboard" aria-label="Cotizaciones recibidas">
  <div className="coti-dashboard-top">
   <div>
    <span className="coti-eyebrow">SEGUIMIENTO DE TU PEDIDO</span>
    <p className="coti-dashboard-subtitle">
     {catalog?.respuestas.length===1?'1 comercio respondió':
      (catalog?.respuestas.length??0)+' comercios respondieron'}
    </p>
   </div>
   <div className="coti-dashboard-actions">
    <button className="button outline" type="button" disabled={busy}
     onClick={()=>void refresh()}>Actualizar</button>
    <button className="button outline" type="button" disabled={busy}
     onClick={()=>void cerrarSesion()}>Cerrar sesión</button>
   </div>
  </div>
  {busy&&<p role="status">Verificando información…</p>}
  {analizando&&<p role="status">Preparando los análisis de los presupuestos recibidos…</p>}
  {error&&<p role="alert">{error}</p>}
  {catalog?.respuestas.length===0&&
   <p className="coti-empty" role="status">Todavía no recibimos cotizaciones. Acá vas a ver cada comercio cuando responda.</p>}
  {catalog?.respuestas.map(q=><article className="coti-offer" key={q.documentoId}>
   <header className="coti-offer-header">
    <span className="coti-supplier-icon" aria-hidden="true">C</span>
    <div className="coti-offer-identity">
     <span className="coti-eyebrow">PRESUPUESTO RECIBIDO</span>
     <h2>{q.comercio}</h2>
     <p>{q.formato} · {new Date(q.recibidoMs).toLocaleDateString('es-AR',{
      day:'2-digit',month:'short',year:'numeric',
      timeZone:'America/Argentina/Buenos_Aires'
     })}</p>
    </div>
    <span className="coti-doc-tag">{q.formato}</span>
   </header>
   <div className="coti-metrics">
    <div className="coti-total-panel">
     <span className="coti-metric-label">Total declarado</span>
     <strong className="coti-total-value">{q.resumen.totalDeclarado??'No informado'}</strong>
     <small>Según la oferta extraída. El PDF original prevalece.</small>
    </div>
    <div className="coti-coverage-panel">
     <span className="coti-metric-label">Artículos identificados</span>
     {q.resumen.cobertura?
      <>
       <strong className="coti-coverage-value">
        {q.resumen.cobertura.identificados}<span> de {q.resumen.cobertura.solicitados}</span>
       </strong>
       <small>Coincidencia por producto, cantidad y presentación</small>
      </>:
      <>
       <strong className="coti-coverage-unknown">Por verificar</strong>
       <small>Aún no hay cotejo de renglones confiable</small>
      </>}
    </div>
   </div>
   <div className="coti-offer-section">
    <h3>Condiciones de la oferta</h3>
    <div className="coti-condition-grid">
     {([
      ['IVA',q.resumen.condiciones.iva],
      ['Flete',q.resumen.condiciones.flete],
      ['Forma de pago',q.resumen.condiciones.pago],
      ['Entrega',q.resumen.condiciones.entrega]
     ] as const).map(([label,value])=>
      <div className="coti-condition" key={label}>
       <span>{label}</span><strong>{value}</strong>
      </div>)}
    </div>
   </div>
   {q.resumen.cobertura&&q.resumen.cobertura.porVerificar.length>0&&
    <div className="coti-review-notice">
     <strong>Artículos para revisar</strong>
     <p>No encontramos una coincidencia segura para:</p>
     <ul>{q.resumen.cobertura.porVerificar.map((name,i)=>
      <li key={i}>{name}</li>)}</ul>
     <small>Esto no demuestra que el comercio no los haya cotizado. Revisá el original.</small>
    </div>}
   {q.resumen.cobertura&&q.resumen.cobertura.adicionales>0&&
    <p className="coti-minor-note">
     {q.resumen.cobertura.adicionales} renglón(es) extra o sin equivalencia
     comprobada con el pedido. Revisá el PDF.
    </p>}
   <details className="coti-analysis-details">
    <summary>
     <span>Observaciones y evidencias del análisis</span>
     <span className="coti-details-count">{q.puntos.length||'Pendiente'}</span>
    </summary>
    {q.puntos.length>0?
     <ul className="coti-evidence-list">
      {q.puntos.map((p,i)=><li key={q.documentoId+'-'+i}>
       <p>{p.observacion}</p>
       <small>Fuente original: «{p.evidencia}»</small>
      </li>)}
     </ul>:
     <p>{q.analisis}</p>}
   </details>
   <button className="button coti-download" type="button" disabled={busy}
    onClick={()=>void download(q.documentoId)}>
    {q.formato==='WhatsApp (texto)'?'Descargar mensaje original':'Descargar original'}
   </button>
   <p className="coti-footer-note">La decisión de compra es tuya. Cotironda no adjudica automáticamente.</p>
  </article>)}
  {informe&&<section aria-label="Informe final de Cotironda"
   className="notice" style={{marginTop:'2rem'}}>
   <h2>Informe final de la ronda</h2>
   <p>Ronda cerrada el {new Date(informe.cierreMs).toLocaleString('es-AR',{
    timeZone:'America/Argentina/Buenos_Aires'
   })}</p>
   <p><strong>{informe.resumen}</strong></p>
   {informe.comparacion.map(item=><div key={item.comercio}
    style={{marginBlock:'1rem'}}>
    <h3>{item.comercio}</h3>
    <p>{item.documentos} documento(s), {item.analizados} con guía verificada.</p>
    <p>Condiciones con evidencia citada:
     {Object.entries(item.condiciones).filter(([,v])=>v==='citado_en_guia')
      .map(([k])=>' '+k.replaceAll('_',' ')).join(',')||' ninguna identificada en la guía'}.
    </p>
    {item.evidencias.slice(0,4).map((p,i)=><p
     key={p.documentoId+'-'+i}>
     <strong>{p.categoria.replaceAll('_',' ')}:</strong> {p.observacion}
     <small> Según el original: «{p.evidencia}»</small>
    </p>)}
   </div>)}
   <ul>{informe.observaciones.map((p,i)=><li key={i}>{p}</li>)}</ul>
   <p><small>{informe.mensaje}</small></p>
  </section>}
 </section>;
}
