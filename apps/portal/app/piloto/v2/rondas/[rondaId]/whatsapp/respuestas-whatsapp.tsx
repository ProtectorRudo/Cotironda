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
 const [expandedDoc,setExpandedDoc]=useState<string|null>(null);
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

 // Guía automática sin intervención del comprador/proveedor, para CUALQUIER ronda D016.
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
 return <section className="coti-buyer-dashboard coti-clean-offers"
  aria-label="Cotizaciones recibidas">
  <div className="coti-clean-bids-heading">
   <h2>{catalog?.respuestas.length??0}
    {(catalog?.respuestas.length??0)===1?' presupuesto recibido':' presupuestos recibidos'}</h2>
   <details className="coti-clean-account-tools">
    <summary>Opciones</summary>
    <div className="coti-clean-account-menu">
     <button type="button" disabled={busy} onClick={()=>void refresh()}>Actualizar</button>
     <button type="button" disabled={busy} onClick={()=>void cerrarSesion()}>Cerrar sesión</button>
    </div>
   </details>
  </div>
  {busy&&<p role="status" className="coti-clean-muted">Verificando información…</p>}
  {analizando&&<p role="status" className="coti-clean-muted">Preparando el análisis…</p>}
  {error&&<p role="alert" className="coti-clean-error">{error}</p>}
  {catalog?.respuestas.length===0&&
   <p className="coti-clean-empty" role="status">Los presupuestos aparecerán acá cuando respondan los comercios.</p>}
  {catalog?.respuestas.map(q=>{
   const cover=q.resumen.cobertura;
   const needsReview=!cover||cover.identificados<cover.solicitados||
    cover.porVerificar.length>0||cover.adicionales>0;
   const expanded=expandedDoc===q.documentoId;
   return <article className="coti-clean-bid" key={q.documentoId}>
    <div className="coti-clean-bid-primary">
     <span className="coti-clean-supplier-avatar" aria-hidden="true">C</span>
     <div className="coti-clean-bid-identity">
      <h3>{q.comercio}</h3>
      <strong className="coti-clean-bid-price">{q.resumen.totalDeclarado??'Total no informado'}</strong>
     </div>
    </div>
    <div className={'coti-clean-coverage'+(needsReview?' caution':'')}>
     <span aria-hidden="true">{needsReview?'!':'✓'}</span>
     <span>{!cover?'Equivalencias por verificar':
      needsReview?cover.identificados+' de '+cover.solicitados+' coincidencias automáticas · revisar':
      cover.identificados+' de '+cover.solicitados+' coincidencias automáticas'}</span>
    </div>
    <div className="coti-clean-bid-actions">
     <button className="coti-clean-detail-button" type="button"
      aria-expanded={expanded} aria-controls={'detalle-'+q.documentoId}
      onClick={()=>setExpandedDoc(expanded?null:q.documentoId)}>
      {expanded?'Ocultar detalle':'Ver detalle'}
     </button>
     <button className="coti-clean-pdf-button" type="button"
      disabled={busy} onClick={()=>void download(q.documentoId)}>
      {q.formato==='WhatsApp (texto)'?'Descargar mensaje original':
       q.formato==='PDF'?'PDF original':'Descargar original'}
     </button>
    </div>
    {expanded&&<div className="coti-clean-bid-expanded" id={'detalle-'+q.documentoId}>
     <h4>Condiciones de la oferta</h4>
     <dl className="coti-clean-terms">
      <div><dt>IVA</dt><dd>{q.resumen.condiciones.iva}</dd></div>
      <div><dt>Flete</dt><dd>{q.resumen.condiciones.flete}</dd></div>
      <div><dt>Pago</dt><dd>{q.resumen.condiciones.pago}</dd></div>
     </dl>
     {cover&&cover.porVerificar.length>0&&<div className="coti-clean-alert">
      <strong>Materiales por verificar</strong>
      <ul>{cover.porVerificar.map((x,i)=><li key={i}>{x}</li>)}</ul>
     </div>}
     {cover&&cover.adicionales>0&&
      <p className="coti-clean-muted">{cover.adicionales} renglón(es) adicionales o sin equivalencia confirmada. Revisá el original.</p>}
     <details className="coti-clean-evidence">
      <summary>Ver análisis completo ({q.puntos.length||'pendiente'})</summary>
      {q.puntos.length>0?<ul>{q.puntos.map((p,i)=><li key={q.documentoId+'-'+i}>
       <p>{p.observacion}</p>
       <small>Fuente original: «{p.evidencia}»</small>
      </li>)}</ul>:<p>{q.analisis}</p>}
     </details>
     <small className="coti-clean-source-note">Los datos proceden del documento recibido. El original prevalece.</small>
    </div>}
   </article>;
  })}
  {informe&&<details className="coti-clean-final">
   <summary>Informe final de la ronda</summary>
   <p>{informe.resumen}</p>
   {informe.comparacion.map(item=><div key={item.comercio}>
    <h3>{item.comercio}</h3>
    <p>{item.documentos} documento(s), {item.analizados} con guía verificada.</p>
    {item.evidencias.slice(0,4).map((p,i)=><p key={p.documentoId+'-'+i}>
     <strong>{p.categoria.replaceAll('_',' ')}:</strong> {p.observacion}
    </p>)}
   </div>)}
   <ul>{informe.observaciones.map((p,i)=><li key={i}>{p}</li>)}</ul>
   <small>{informe.mensaje}</small>
  </details>}
 </section>;
}
