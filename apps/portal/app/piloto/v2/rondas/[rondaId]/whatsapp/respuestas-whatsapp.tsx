'use client';
/** Cotironda D016: sesión HttpOnly, no OTP ni JWT en JavaScript. */
import {useCallback,useEffect,useRef,useState} from 'react';
import type {CatalogoRespuestasV2} from '../../../../../../../../src/server/v2-03-catalogo-respondedores.ts';
import type {InformeFinalD016}
 from '../../../../../../../../src/server/v2-d016-informe-final.ts';
import {nombreDescargaOriginalV2} from '../../../../../../lib/piloto-v2-nombre-descarga.ts';
import {cantidadSolicitadaVisibleD020,descripcionMaterialVisibleD020}
 from '../../../../../../lib/piloto-v2-materiales-visibles.ts';
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
 const [originalTexto,setOriginalTexto]=useState<{id:string;text:string}|null>(null);
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

 async function download(doc:string,inlineText=false){
  if(busy||!catalog)return;
  if(inlineText&&originalTexto?.id===doc){setOriginalTexto(null);return;}
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
   if(inlineText){
    if(mime?.split(';')[0]!=='text/plain'||bytes.byteLength>4000)
     throw Error('invalid_text_original');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    if(text.length<5||text.length>4000)throw Error('invalid_text_size');
    // React escapes message text. No fake screenshot, HTML or public URL.
    setOriginalTexto({id:doc,text});
   }else{
    const link=URL.createObjectURL(new Blob([bytes],{
     type:mime??'application/octet-stream'
    }));
    const a=document.createElement('a');
    a.href=link;a.download=nombreDescargaOriginalV2(doc,mime);
    a.style.display='none';document.body.appendChild(a);a.click();a.remove();
    window.setTimeout(()=>URL.revokeObjectURL(link),30000);
   }
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
   setCatalog(null);setOriginalTexto(null);setCerrada(true);
  }catch{setError('No pudimos cerrar tu sesión. Volvé a intentarlo.');}
  finally{setBusy(false)}
 }
 // Solo presentamos datos comerciales de la fuente privada ya autorizada.
 const solicitudes=catalog?.respuestas.filter(q=>q.resumen.solicitado.length>0)??[];
 const solicitados=solicitudes[0]?.resumen.solicitado??[];
 const pedidoConsistente=solicitudes.every(q=>{
  const lines=q.resumen.solicitado;
  return lines.length===solicitados.length&&lines.every((item,i)=>
   item.line===solicitados[i].line&&item.description===solicitados[i].description&&
   item.quantity===solicitados[i].quantity&&item.unit===solicitados[i].unit);
 });
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
  {pedidoConsistente&&solicitados.length>0&&<details className="coti-request-list">
   <summary>Ver los {solicitados.length} materiales solicitados</summary>
   <ul className="coti-request-lines">{solicitados.map(item=><li key={item.line}>
    <strong className="coti-request-quantity"
     aria-label={'Cantidad solicitada: '+cantidadSolicitadaVisibleD020(item.quantity)}>
     {cantidadSolicitadaVisibleD020(item.quantity)}
    </strong>
    <span className="coti-request-description">{descripcionMaterialVisibleD020(item.description,item.quantity)}</span>
   </li>)}</ul>
  </details>}
  {!pedidoConsistente&&<p className="coti-clean-muted">La lista de materiales requiere revisión del original antes de mostrarla.</p>}
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
   const diferencias=cover?.detalle.filter(item=>item.estado==='por_verificar')??[];
   // Mostrar valor comercial y diferencias técnicas, sin transcribir los importes
   // por renglón del PDF ni repetir observaciones de precio, flete o pago.
   const notasTecnicas=q.puntos.filter(p=>
    ['material','presentacion','cobertura','disponibilidad'].includes(p.categoria)&&
    !/\$|\b(?:precio|subtotal|total|iva|flete|pago|descuento)\b/iu.test(p.observacion));
   const conditions=q.resumen.condiciones;
   const importeDeclarado=q.resumen.totalDeclarado;
   const sumaCalculada=q.resumen.sumaCalculada;
   const esSuma=importeDeclarado===null&&sumaCalculada!==null;
   const cotizados=q.resumen.articulosCotizados;
   const enviados=q.resumen.articulosEnviados;
   const articulosVisibles=cotizados??(
    q.resumen.detalleCotizado.length>0?q.resumen.detalleCotizado.length:null);
   // Un recuento de renglones NO certifica equivalencia de cantidades.
   const conteoConfiable=cotizados!==null&&enviados!==null;
   return <article className="coti-clean-bid" key={q.documentoId}>
    <div className="coti-clean-bid-primary">
     <span className="coti-clean-supplier-avatar" aria-hidden="true">{letraProveedor(q.comercio)}</span>
     <div className="coti-clean-bid-identity">
      <h3>{nombreProveedor(q.comercio)}</h3>
      <strong className="coti-clean-bid-price">{importeDeclarado??sumaCalculada??'No informado'}</strong>
      <small className="coti-clean-amount-kind">{esSuma?'Suma de artículos cotizados':q.resumen.tipoImporte}</small>
     </div>
    </div>
    <div className={'coti-clean-coverage'+(needsReview?' caution':'')}>
     <span aria-hidden="true">{needsReview?'!':'✓'}</span>
     <span>{articulosVisibles!==null?
      articulosVisibles+' artículos cotizados'+
       (conteoConfiable?' · '+enviados+' enviados a este negocio':''):
      'Materiales por verificar en el presupuesto original'}</span>
    </div>
    <div className="coti-clean-bid-actions">
     <button className="coti-clean-detail-button" type="button"
      aria-expanded={expanded} aria-controls={'detalle-'+q.documentoId}
      onClick={()=>setExpandedDoc(expanded?null:q.documentoId)}>
      {expanded?'Ocultar análisis':'Ver análisis'}
     </button>
     <button className="coti-clean-pdf-button" type="button"
      disabled={busy} onClick={()=>void download(q.documentoId,
      q.formato==='WhatsApp (texto)')}>
      {q.formato==='WhatsApp (texto)'?
       originalTexto?.id===q.documentoId?'Ocultar mensaje original':'Ver mensaje original':
       q.formato==='PDF'?'PDF original':'Descargar original'}
     </button>
    </div>
    {q.formato==='WhatsApp (texto)'&&originalTexto?.id===q.documentoId&&
     <div className="coti-clean-original-message" aria-label="Mensaje original autorizado">
      <strong>Mensaje original de WhatsApp</strong>
      <pre>{originalTexto.text}</pre>
     </div>}
    {expanded&&<div className="coti-clean-bid-expanded" id={'detalle-'+q.documentoId}>
     <h4>Lo importante de este presupuesto</h4>
     {esSuma&&<p className="coti-clean-muted">
      Suma calculada de los importes por artículo; el total declarado por el proveedor no está confirmado. Revisá el original.
     </p>}
     {q.resumen.discrepanciaTotal&&<p className="coti-clean-muted">
      La suma de los renglones no coincide con el total informado. Revisá el original.
     </p>}
     {q.formato==='WhatsApp (texto)'&&q.resumen.detalleCotizado.length>0&&
      <div className="coti-clean-text-article-summary">
       <strong>Artículos mencionados en el mensaje</strong>
       <ul className="coti-clean-insights">
        {q.resumen.detalleCotizado.slice(0,5).map((item,i)=>
         <li key={q.documentoId+'-texto-articulo-'+i}>
          {item.cantidad?item.cantidad+' · ':''}{item.descripcion}
         </li>)}
       </ul>
       {q.resumen.detalleCotizado.length>5&&
        <p className="coti-clean-muted">
         Los demás artículos se consultan en el mensaje original.
        </p>}
      </div>}
     {diferencias.length>0&&<div className="coti-clean-alert">
      <strong>Equivalencias técnicas por comprobar</strong>
      <ul>{diferencias.slice(0,3).map(item=><li key={item.linea}>
       {item.solicitado}
       {item.cotizado?' · El original menciona: '+item.cotizado:''}
      </li>)}</ul>
     </div>}
     {cover&&cover.adicionales>0&&
      <p className="coti-clean-muted">
       {cover.adicionales} renglón(es) adicional(es) o sin equivalencia confirmada.
       Consultá el presupuesto original.
      </p>}
     {!cover&&<p className="coti-clean-muted">
      {q.resumen.detalleCotizado.length>0?
       'Hay artículos cotizados, pero todavía falta confirmar que las cantidades y presentaciones equivalgan a las solicitadas.':
       'No se pudo confirmar la equivalencia técnica de los materiales. Consultá el original antes de comparar.'}
     </p>}
     {notasTecnicas.length>0&&<ul className="coti-clean-insights">
      {notasTecnicas.slice(0,3).map((p,i)=><li key={q.documentoId+'-nota-'+i}>
       {p.observacion}</li>)}
     </ul>}
     {q.resumen.descuento&&<p className="coti-clean-muted">
      <strong>Descuento informado:</strong> {q.resumen.descuento}.
     </p>}
     <h4 className="coti-terms-heading">Condiciones de la oferta</h4>
     <dl className="coti-clean-terms">
      <div><dt>IVA</dt><dd>{conditions.iva}</dd></div>
      <div><dt>Flete</dt><dd>{conditions.flete}</dd></div>
      <div><dt>Pago</dt><dd>{conditions.pago}</dd></div>
     </dl>
     <p className="coti-clean-muted">
      Precios unitarios, subtotales y cantidades: consultá el presupuesto original.
     </p>
    </div>}
   </article>;
  })}
  {informe&&<section className="coti-clean-final" aria-label="Comparación final de la ronda">
   <h2>Comparación final</h2>
   <p>{informe.conclusion}</p>
   <div className="coti-final-list">
    {informe.comparacion.map(item=><article className="coti-final-supplier" key={item.comercio}>
     <h3>{nombreProveedor(item.comercio)}</h3>
     {item.ofertas.map(oferta=><div className="coti-final-offer" key={oferta.documentoId}>
      <strong className="coti-final-amount">{oferta.importe??'No informado'}</strong>
      <small>{oferta.tipoImporte}</small>
      {oferta.articulosCotizados!==null&&
       <p><strong>{oferta.articulosCotizados} artículos cotizados</strong>
        {oferta.articulosEnviados!==null?
         ' · '+oferta.articulosEnviados+' enviados a este negocio':''}</p>}
      {(!oferta.cobertura||
       oferta.cobertura.identificados<oferta.cobertura.solicitados||
       oferta.cobertura.porVerificar.length>0)&&
       <p className="coti-clean-muted">Equivalencias técnicas por verificar en el original.</p>}
     </div>)}
    </article>)}
   </div>
   {informe.observacionesIA.length>0&&<div className="coti-final-guidance">
    <h3>Observaciones de los presupuestos</h3>
    <ul>{informe.observacionesIA.map((p,i)=>
     <li key={p.comercio+'-'+i}>
      <strong>{nombreProveedor(p.comercio)}:</strong> {p.observacion}
     </li>)}</ul>
   </div>}
   {informe.materiales.length>0&&
    <details className="coti-clean-evidence">
     <summary>Ver detalle técnico por material</summary>
     <div className="coti-final-materials">
      {informe.materiales.map(material=><article className="coti-final-material" key={material.linea}>
       <h4>{material.material}</h4>
       <ul>{material.comercios.map(item=><li key={item.comercio}>
        <strong>{nombreProveedor(item.comercio)}</strong>
        <span>{item.estado==='coincidencia_automatica'?
         'Coincidencia automática · '+item.cotizado:
         item.estado==='por_verificar'?'Equivalencia por verificar'+
          (item.cotizado?' · '+item.cotizado:''):
         'Sin equivalencia confirmada con este artículo'}</span>
       </li>)}</ul>
      </article>)}
     </div>
    </details>}
   <p className="coti-final-decision">La decisión comercial es tuya. Cotironda no adjudica automáticamente.</p>
   <small>{informe.mensaje}</small>
  </section>}
 </section>;
}
