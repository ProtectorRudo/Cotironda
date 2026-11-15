'use client';
/** Cotironda D016: sesión HttpOnly, no OTP ni JWT en JavaScript. */
import {useCallback,useEffect,useRef,useState} from 'react';
import type {CatalogoRespuestasV2} from '../../../../../../../../src/server/v2-03-catalogo-respondedores.ts';
import type {InformeFinalD016}
 from '../../../../../../../../src/server/v2-d016-informe-final.ts';
import {nombreDescargaOriginalV2} from '../../../../../../lib/piloto-v2-nombre-descarga.ts';

export function RespuestasWhatsappD016({rondaId}:{rondaId:string}){
 const [catalog,setCatalog]=useState<CatalogoRespuestasV2|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [cerrada,setCerrada]=useState(false);
 const version=useRef(0);
 const running=useRef<number|null>(null);
 const startedAnalyses=useRef(new Set<string>());
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

 // La guía se genera sin intervención: sólo al abrir una ronda válida.
 // SQL impide cobros por reintentos: un job/SHA, lease 90 s, máximo tres
 // intentos de modelo. Este portal limita a seis candidatos por visita.
 useEffect(()=>{
  if(cerrada||!catalog||analysisRunning.current)return;
  const pending=catalog.respuestas.filter(q=>q.puntos.length===0&&
   !startedAnalyses.current.has(q.documentoId)).slice(0,6);
  if(pending.length===0)return;
  let active=true;
  analysisRunning.current=true;
  const current=version.current;
  setAnalizando(true);
  void (async()=>{
   let changed=false;
   try{
    for(const item of pending){
     if(!active||current!==version.current)break;
     startedAnalyses.current.add(item.documentoId);
     try{
      const answer=await fetch(url+'/analisis-whatsapp/'+
       encodeURIComponent(item.documentoId),{
       method:'POST',credentials:'same-origin',cache:'no-store',
       headers:{'accept':'application/json'},
       signal:AbortSignal.timeout(55_000)
      });
      if(answer.ok)changed=true;
      if(answer.status===401||answer.status===403||answer.status===404)
       break;
     }catch{/* El original permanece accesible. */}
    }
   }finally{
    analysisRunning.current=false;
    // Una actualización periódica puede reemplazar el catálogo mientras
    // el modelo trabaja. Limpiar el indicador aunque cambie el render.
    if(current===version.current){
     setAnalizando(false);
     if(changed)void refresh(true);
    }
   }
  })();
  return ()=>{active=false};
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
   setCatalog(null);setCerrada(true);
  }catch{setError('No pudimos cerrar tu sesión. Volvé a intentarlo.');}
  finally{setBusy(false)}
 }
 if(cerrada)return <p role="status">Tu sesión está cerrada. Podés pedir otro enlace por WhatsApp.</p>;
 if(loading)return <p role="status">Comprobando tu pedido…</p>;
 if(error&&!catalog)return <p role="alert">{error}</p>;
 return <section aria-label="Cotizaciones recibidas">
  <div className="actions">
   <button className="button outline" type="button"
    disabled={busy} onClick={()=>void refresh()}>Actualizar</button>
   <button className="button outline" type="button" disabled={busy}
    onClick={()=>void cerrarSesion()}>Cerrar sesión</button>
  </div>
  {busy&&<p role="status">Verificando información…</p>}
  {analizando&&<p role="status">Preparando los análisis de los presupuestos recibidos…</p>}
  {error&&<p role="alert">{error}</p>}
  {catalog?.respuestas.length===0&&
   <p role="status">Todavía no recibimos cotizaciones</p>}
  {catalog?.respuestas.map(q=><article key={q.documentoId}
   className="notice" style={{marginBlock:'1rem'}}>
   <h2>{q.comercio}</h2>
   <p>{q.formato} · Recibido el {new Date(q.recibidoMs).toLocaleString('es-AR',{
    timeZone:'America/Argentina/Buenos_Aires'
   })}</p>
   <p><strong>{q.analisis}</strong></p>
   {q.puntos.length>0&&<ul aria-label="Claves del presupuesto">
    {q.puntos.map((p,i)=><li key={q.documentoId+'-'+i}>
     <p>{p.observacion}</p>
     <small>Según el original: «{p.evidencia}»</small>
    </li>)}
   </ul>}
   <button className="button" type="button" disabled={busy}
    onClick={()=>void download(q.documentoId)}>
    {q.formato==='WhatsApp (texto)'?'Descargar mensaje original':'Descargar original'}
   </button>
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
