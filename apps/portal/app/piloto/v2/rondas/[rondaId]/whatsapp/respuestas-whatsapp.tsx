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
 // Solo presentamos datos comerciales de la fuente privada ya autorizada.
 const solicitados=catalog?.respuestas.find(q=>q.resumen.solicitado.length>0)?.resumen.solicitado??[];
 const letraProveedor=(name:string)=>{
  const n=name.replace(/^(?:corral[oó]n|ferreter[ií]a|pinturer[ií]a|distribuidora|casa de materiales)\s+/iu,'')
   .trim();
  return (n[0]??name[0]??'C').toLocaleUpperCase('es-AR');
 };
 const nombreProveedor=(name:string)=>name.replace(/\s*·\s*prueba\s*$/iu,'');
 if(cerrada)return <p role="status">Tu sesión está cerrada. Podés pedir otro enlace por WhatsApp.</p>;
 if(loading)return <div role="status" aria-label="Cargando presupuestos" className="coti-skeleton-stack">
  <div className="coti-skeleton-line short"/>
  <div className="coti-skeleton-row"/><div className="coti-skeleton-row"/>
  <span className="coti-screen-reader">Comprobando tu pedido…</span>
 </div>;
 if(error&&!catalog)return <div role="alert" className="coti-clean-error">
  <p>{error}</p>
  <button type="button" onClick={()=>void refresh()}>Volver a intentar</button>
 </div>;
 return <section className="coti-buyer-dashboard coti-clean-offers" aria-label="Cotizaciones recibidas">
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
  {solicitados.length>0&&<details className="coti-request-list">
   <summary>Ver los {solicitados.length} materiales solicitados</summary>
   <ol>{solicitados.map(item=><li key={item.line}>{item.description}</li>)}</ol>
  </details>}
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
   const puntosUtiles=q.puntos.filter(p=>
    p.categoria!=='plazo'&&!/plazo de entrega|0 d[ií]as/iu.test(p.observacion));
   const notasTecnicas=puntosUtiles.filter(p=>
    ['material','presentacion','cobertura','disponibilidad'].includes(p.categoria));
   const conditions=q.resumen.condiciones;
   return <article className="coti-clean-bid" key={q.documentoId}>
    <div className="coti-clean-bid-primary">
     <span className="coti-clean-supplier-avatar" aria-hidden="true">{letraProveedor(q.comercio)}</span>
     <div className="coti-clean-bid-identity">
      <h3>{nombreProveedor(q.comercio)}</h3>
      <strong className="coti-clean-bid-price">{q.resumen.totalDeclarado??'No informado'}</strong>
      <small className="coti-clean-amount-kind">{q.resumen.tipoImporte}</small>
     </div>
    </div>
    <div className={'coti-clean-coverage'+(needsReview?' caution':'')}>
     <span aria-hidden="true">{needsReview?'!':'✓'}</span>
     <span>{!cover?'Equivalencias por verificar':
      needsReview?cover.identificados+' de '+cover.solicitados+' materiales coincidentes · revisar':
      cover.identificados+' de '+cover.solicitados+' materiales coincidentes'}</span>
    </div>
    <div className="coti-clean-bid-actions">
     <button className="coti-clean-detail-button" type="button"
      aria-expanded={expanded} aria-controls={'detalle-'+q.documentoId}
      onClick={()=>setExpandedDoc(expanded?null:q.documentoId)}>
      {expanded?'Ocultar análisis':'Ver análisis'}
     </button>
     <button className="coti-clean-pdf-button" type="button"
      disabled={busy} onClick={()=>void download(q.documentoId)}>
      {q.formato==='WhatsApp (texto)'?'Mensaje original':
       q.formato==='PDF'?'PDF original':'Descargar original'}
     </button>
    </div>
    {expanded&&<div className="coti-clean-bid-expanded" id={'detalle-'+q.documentoId}>
     <h4>Lo importante de este presupuesto</h4>
     <ul className="coti-clean-insights">
      <li><strong>Materiales:</strong> {cover?
       cover.identificados+' de '+cover.solicitados+' coincidencias técnicas verificables.':
       'No se pudo verificar la cobertura técnica.'}
       {needsReview?' Hay diferencias o equivalencias pendientes de revisión.':''}</li>
      {notasTecnicas.slice(0,2).map((p,i)=><li key={q.documentoId+'-nota-'+i}>
       {p.observacion}</li>)}
      <li><strong>Importe:</strong> {q.resumen.totalDeclarado?
       q.resumen.tipoImporte.toLowerCase()+' de '+q.resumen.totalDeclarado+'.':
       'No informado en la extracción verificada.'}
       {q.resumen.tipoImporte!=='Total informado'&&q.resumen.totalDeclarado?
        ' No se presupone que sea el total final.':''}</li>
     </ul>
     {cover&&cover.porVerificar.length>0&&<div className="coti-clean-alert">
      <strong>Materiales sin equivalencia confirmada</strong>
      <ul>{cover.porVerificar.map((x,i)=><li key={i}>{x}</li>)}</ul>
     </div>}
     {cover&&cover.adicionales>0&&
      <p className="coti-clean-muted">{cover.adicionales} artículo(s) adicional(es) o sin equivalencia confirmada en el presupuesto. Verificá el PDF.</p>}
     <h4 className="coti-terms-heading">Condiciones de la oferta</h4>
     <dl className="coti-clean-terms">
      <div><dt>IVA</dt><dd>{conditions.iva}</dd></div>
      <div><dt>Flete</dt><dd>{conditions.flete}</dd></div>
      <div><dt>Pago</dt><dd>{conditions.pago}</dd></div>
     </dl>
     {puntosUtiles.length>0?<details className="coti-clean-evidence">
      <summary>Ver evidencia del presupuesto ({puntosUtiles.length})</summary>
      <ul>{puntosUtiles.map((p,i)=><li key={q.documentoId+'-evidencia-'+i}>
       <p>{p.observacion}</p>
       <small>Fuente original: «{p.evidencia}»</small>
      </li>)}</ul>
     </details>:<p className="coti-clean-muted">{q.analisis}</p>}
     <small className="coti-clean-source-note">Los datos proceden del documento recibido. El original prevalece.</small>
    </div>}
   </article>;
  })}
  {informe&&<section className="coti-clean-final" aria-label="Comparación final de la ronda">
   <h2>Comparación final</h2>
   <p>{informe.resumen}</p>
   <div className="coti-final-list">
    {informe.comparacion.map(item=><article className="coti-final-supplier" key={item.comercio}>
     <h3>{nombreProveedor(item.comercio)}</h3>
     {item.ofertas.map(oferta=><div className="coti-final-offer" key={oferta.documentoId}>
      <strong className="coti-final-amount">{oferta.importe??'No informado'}</strong>
      <small>{oferta.tipoImporte}</small>
      <p><strong>Materiales:</strong> {oferta.cobertura?
       oferta.cobertura.identificados+' de '+oferta.cobertura.solicitados+' coincidencias verificables':
       'Cobertura por verificar'}</p>
      {oferta.cobertura&&oferta.cobertura.porVerificar.length>0&&
       <p>Por verificar: {oferta.cobertura.porVerificar.join('; ')}</p>}
      <p><strong>Pago:</strong> {oferta.pago} · <strong>IVA:</strong> {oferta.iva} · <strong>Flete:</strong> {oferta.flete}</p>
     </div>)}
     {item.ofertas.length===0&&<p>Sin documentación comercial verificable.</p>}
     {item.evidencias.length>0&&<details className="coti-clean-evidence">
      <summary>Consultar evidencia</summary>
      <ul>{item.evidencias.map((p,i)=><li key={p.documentoId+'-'+i}>
       <p>{p.observacion}</p><small>«{p.evidencia}»</small>
      </li>)}</ul>
     </details>}
    </article>)}
   </div>
   <p className="coti-final-decision">Compará únicamente productos equivalentes. La elección del comercio es tuya; Cotironda no adjudica automáticamente.</p>
   <small>{informe.mensaje}</small>
  </section>}
 </section>;
}
