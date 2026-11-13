'use client';
/** Cotironda D016: sesión HttpOnly, no OTP ni JWT en JavaScript. */
import {useCallback,useEffect,useRef,useState} from 'react';
import type {CatalogoRespuestasV2} from '../../../../../../../../src/server/v2-03-catalogo-respondedores.ts';
import {nombreDescargaOriginalV2} from '../../../../../../lib/piloto-v2-nombre-descarga.ts';

export function RespuestasWhatsappD016({rondaId}:{rondaId:string}){
 const [catalog,setCatalog]=useState<CatalogoRespuestasV2|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const version=useRef(0);
 const running=useRef<number|null>(null);
 const url='/api/piloto/v2/rondas/'+encodeURIComponent(rondaId);
 const refresh=useCallback(async(silent=false)=>{
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
 },[url]);
 useEffect(()=>{
  void refresh();
  const timer=window.setInterval(()=>{
   if(document.visibilityState==='visible'&&running.current!==version.current)
    void refresh(true);
  },60_000);
  return ()=>{version.current++;window.clearInterval(timer)};
 },[refresh]);

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
 if(loading)return <p role="status">Comprobando tu pedido…</p>;
 if(error&&!catalog)return <p role="alert">{error}</p>;
 return <section aria-label="Cotizaciones recibidas">
  <div className="actions">
   <button className="button outline" type="button"
    disabled={busy} onClick={()=>void refresh()}>Actualizar</button>
  </div>
  {busy&&<p role="status">Verificando información…</p>}
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
   {q.formato==='WhatsApp (texto)'?
    <p>El mensaje original está protegido. Su descarga estará habilitada
     cuando se verifique la lectura segura del texto.</p>:
    <button className="button" type="button" disabled={busy}
     onClick={()=>void download(q.documentoId)}>Descargar original</button>}
  </article>)}
 </section>;
}
