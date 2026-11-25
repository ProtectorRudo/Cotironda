'use client';
import {useCallback,useEffect,useState} from 'react';
import type {RondaHistorialD017} from '../../../../../../src/server/v2-d017-historial-comprador.ts';
type Oferta={comercio:string;formato:string;importe:string|null;tipoImporte:string;cotizados:number|null;enviados:number|null;iva:string;flete:string;pago:string;discrepancia:boolean};
const date=(ms:number)=>new Date(ms).toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric',timeZone:'America/Argentina/Buenos_Aires'});
export function HistorialCompartidoV2(){
 const [rounds,setRounds]=useState<readonly RondaHistorialD017[]>([]);
 const [selected,setSelected]=useState<RondaHistorialD017|null>(null);
 const [offers,setOffers]=useState<Oferta[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState(false);
 const refresh=useCallback(async(ronda:RondaHistorialD017|null)=>{
  setLoading(true);setError(false);setSelected(ronda);setOffers([]);setRounds([]);
  try{
   const token=window.location.hash.slice(1);
   if(!token)throw Error('missing');
   const res=await fetch('/api/piloto/v2/compartido',{method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{'x-cotironda-share':'1','content-type':'application/json'},body:JSON.stringify({token,rondaId:ronda?.rondaId??null}),signal:AbortSignal.timeout(20000)});
   if(!res.ok)throw Error('denied');
   const d=await res.json();
   if(ronda){if(d.estado!=='cotizaciones_compartidas'||!Array.isArray(d.ofertas))throw Error('invalid');setOffers(d.ofertas)}
   else{if(d.estado!=='historial_autorizado'||!Array.isArray(d.cotizaciones))throw Error('invalid');setRounds(d.cotizaciones)}
  }catch{setError(true);setOffers([]);setRounds([])}
  finally{setLoading(false)}
 },[]);
 useEffect(()=>{void refresh(null)},[refresh]);
 useEffect(()=>{
  const check=()=>{if(document.visibilityState==='visible')void refresh(selected)};
  document.addEventListener('visibilitychange',check);
  const id=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh(selected)},60000);
  return ()=>{document.removeEventListener('visibilitychange',check);window.clearInterval(id)};
 },[refresh,selected]);
 return <section className="coti-clean-history">
  <p className="coti-clean-muted">Vista compartida · Solo lectura</p>
  <button type="button" disabled={loading} onClick={()=>void refresh(selected)}>Actualizar</button>
  {selected&&<button type="button" disabled={loading} className="button outline" onClick={()=>void refresh(null)}>← Cotizaciones compartidas</button>}
  {loading?<p role="status">Consultando cotizaciones…</p>:error?<p role="alert">El enlace no está disponible o fue desactivado.</p>:selected?<>
   <h2>Pedido del {date(selected.fechaMs)}</h2>
   <p>{selected.localidad} · {selected.articulos} materiales</p>
   <p>{offers.length} presupuestos recibidos</p>
   {offers.map((q,i)=><article key={i} className="coti-profile-message">
    <h3>{q.comercio}</h3><h2>{q.importe??'No informado'}</h2><p>{q.tipoImporte}</p>
    <p>{q.cotizados===null?'Materiales por verificar':q.cotizados+' artículos cotizados'}{q.enviados===null?'':' · '+q.enviados+' enviados a este negocio'}</p>
    <details><summary>Ver resumen comercial</summary><p>IVA: {q.iva}</p><p>Flete: {q.flete}</p><p>Pago: {q.pago}</p>{q.discrepancia&&<p>El importe declarado y la suma de renglones difieren.</p>}</details>
   </article>)}
  </>:rounds.length?rounds.map(r=><button type="button" key={r.rondaId} className="coti-history-item" onClick={()=>void refresh(r)}>
   <div className="coti-history-details"><strong>{date(r.fechaMs)}</strong><p>{r.localidad} · {r.articulos} materiales</p><span className="coti-history-documents">{r.originales} presupuestos recibidos</span></div><span className="coti-history-state">{r.estado==='closed'?'Cerrada':'En curso'}</span>
  </button>):<p>No hay cotizaciones compartidas.</p>}
  <p className="coti-profile-privacy">Los archivos originales y el acceso a la cuenta permanecen privados.</p>
 </section>;
}
