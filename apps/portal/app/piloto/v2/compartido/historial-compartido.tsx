'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {RondaHistorialD017} from '../../../../../../src/server/v2-d017-historial-comprador.ts';
type Oferta={comercio:string;formato:string;importe:string|null;tipoImporte:string;cotizados:number|null;enviados:number|null;iva:string;flete:string;pago:string;discrepancia:boolean};
const date=(ms:number)=>new Date(ms).toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric',timeZone:'America/Argentina/Buenos_Aires'});
const shortDate=(ms:number)=>new Date(ms).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'America/Argentina/Buenos_Aires'});
const nombreProveedor=(name:string)=>name.replace(/\s*·\s*prueba\s*$/iu,'');
function inicialProveedor(name:string){
 const n=nombreProveedor(name).replace(/^(?:corral[oó]n|ferreter[ií]a|pinturer[ií]a|distribuidora|casa de materiales)\s+/iu,'').trim();
 return (n[0]??name[0]??'C').toLocaleUpperCase('es-AR');
}
function RoundRow({r,onSelect}:{r:RondaHistorialD017;onSelect:()=>void}){
 const dia=new Date(r.fechaMs);
 const active=r.estado==='prepared';
 return <button type="button" className={'coti-history-item '+(active?'coti-history-active':'')} onClick={onSelect}>
  <span className="coti-history-date-icon" aria-hidden="true">
   <span>{dia.toLocaleDateString('es-AR',{day:'2-digit',timeZone:'America/Argentina/Buenos_Aires'})}</span>
   <small>{dia.toLocaleDateString('es-AR',{month:'short',timeZone:'America/Argentina/Buenos_Aires'})}</small>
  </span>
  <span className="coti-history-details">
   <span className="coti-history-mainline"><strong>{date(r.fechaMs)}</strong></span>
   <span className="coti-shared-round-meta">{r.localidad||'Localidad no informada'} · {r.articulos} {r.articulos===1?'material':'materiales'}</span>
   <span className="coti-history-documents">{r.originales} {r.originales===1?'presupuesto recibido':'presupuestos recibidos'}</span>
  </span>
  <span className={'coti-history-state '+(active?'active':'closed')}>{active?'En curso':'Cerrada'}</span>
  <span className="coti-history-chevron" aria-hidden="true">›</span>
 </button>;
}
function SharedOffer({q}:{q:Oferta}){
 const [expanded,setExpanded]=useState(false);
 return <article className="coti-clean-bid">
  <div className="coti-clean-bid-primary">
   <span className="coti-clean-supplier-avatar" aria-hidden="true">{inicialProveedor(q.comercio)}</span>
   <div className="coti-clean-bid-identity">
    <h3 className="coti-shared-supplier-name">{nombreProveedor(q.comercio)}</h3>
    <strong className="coti-clean-bid-price">{q.importe??'No informado'}</strong>
    <small className="coti-clean-amount-kind">{q.tipoImporte}</small>
   </div>
  </div>
  <div className={'coti-clean-coverage'+(q.cotizados===null?' caution':'')}>
   <span>{q.cotizados===null?'Materiales por verificar':q.cotizados+' '+(q.cotizados===1?'artículo cotizado':'artículos cotizados')+(q.enviados===null?'':' · '+q.enviados+' enviados a este negocio')}</span>
  </div>
  <div className="coti-clean-bid-actions coti-shared-one-action">
   <button type="button" className="coti-clean-detail-button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'Ocultar resumen':'Ver resumen comercial'}</button>
  </div>
  {expanded&&<div className="coti-clean-bid-expanded">
   <h4>Condiciones comerciales</h4>
   <dl className="coti-clean-terms">
    <div><dt>IVA</dt><dd>{q.iva}</dd></div>
    <div><dt>Flete</dt><dd>{q.flete}</dd></div>
    <div><dt>Pago</dt><dd>{q.pago}</dd></div>
   </dl>
   {q.discrepancia&&<p className="coti-clean-muted">El importe declarado y la suma de renglones difieren.</p>}
  </div>}
 </article>;
}
export function HistorialCompartidoV2(){
 const [rounds,setRounds]=useState<readonly RondaHistorialD017[]>([]);
 const [selected,setSelected]=useState<RondaHistorialD017|null>(null);
 const [offers,setOffers]=useState<Oferta[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState(false);
 const sequence=useRef(0);
 const refresh=useCallback(async(ronda:RondaHistorialD017|null)=>{
  const current=++sequence.current;
  setLoading(true);setError(false);setSelected(ronda);setOffers([]);setRounds([]);
  try{
   const token=window.location.hash.slice(1);
   if(!token)throw Error('missing');
   const res=await fetch('/api/piloto/v2/compartido',{method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{'x-cotironda-share':'1','content-type':'application/json'},body:JSON.stringify({token,rondaId:ronda?.rondaId??null}),signal:AbortSignal.timeout(20000)});
   if(!res.ok)throw Error('denied');
   const d=await res.json();
   if(current!==sequence.current)return;
   if(ronda){if(d.estado!=='cotizaciones_compartidas'||!Array.isArray(d.ofertas))throw Error('invalid');setOffers(d.ofertas)}
   else{if(d.estado!=='historial_autorizado'||!Array.isArray(d.cotizaciones))throw Error('invalid');setRounds(d.cotizaciones)}
  }catch{if(current===sequence.current){setError(true);setOffers([]);setRounds([])}}
  finally{if(current===sequence.current)setLoading(false)}
 },[]);
 useEffect(()=>{void refresh(null)},[refresh]);
 useEffect(()=>{
  const check=()=>{if(document.visibilityState==='visible')void refresh(selected)};
  document.addEventListener('visibilitychange',check);
  const id=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh(selected)},60000);
  return ()=>{document.removeEventListener('visibilitychange',check);window.clearInterval(id)};
 },[refresh,selected]);
 const active=rounds.filter(r=>r.estado==='prepared');
 const closed=rounds.filter(r=>r.estado==='closed');
 return <section className="coti-clean-history coti-shared-view" aria-label="Cotizaciones compartidas">
  {selected&&<button type="button" className="coti-shared-back" disabled={loading} onClick={()=>void refresh(null)}>← Cotizaciones compartidas</button>}
  <header className="coti-profile-heading">
   <h1>{selected?'Pedido del '+shortDate(selected.fechaMs):'Cotizaciones compartidas'}</h1>
   {selected&&<p>{selected.localidad||'Localidad no informada'} · {selected.articulos} {selected.articulos===1?'material':'materiales'}</p>}
  </header>
  <div className="coti-clean-profilebar">
   <span>Solo lectura</span>
   <button type="button" className="coti-shared-refresh" disabled={loading} onClick={()=>void refresh(selected)}>Actualizar</button>
  </div>
  {loading?<div role="status" aria-label="Cargando cotizaciones" className="coti-skeleton-stack">
   <div className="coti-skeleton-row"/><div className="coti-skeleton-row"/>
   <span className="coti-screen-reader">Consultando cotizaciones…</span>
  </div>:error?<p role="alert" className="coti-clean-error">El enlace no está disponible o fue desactivado.</p>:selected?<div className="coti-clean-offers">
   <div className="coti-clean-bids-heading"><h2>{offers.length} {offers.length===1?'presupuesto recibido':'presupuestos recibidos'}</h2></div>
   {offers.length?offers.map((q,i)=><SharedOffer key={selected.rondaId+':'+i} q={q}/>):<p className="coti-clean-empty">Todavía no recibimos cotizaciones.</p>}
  </div>:<>
   {active.length>0&&<section className="coti-history-group" aria-label="Cotizaciones en curso">
    <div className="coti-history-title"><h2>En curso</h2></div>
    {active.map(r=><RoundRow key={r.rondaId} r={r} onSelect={()=>void refresh(r)}/>)}
   </section>}
   {closed.length>0&&<section className="coti-history-group" aria-label="Historial">
    <div className="coti-history-title"><h2>Historial</h2></div>
    {closed.map(r=><RoundRow key={r.rondaId} r={r} onSelect={()=>void refresh(r)}/>)}
   </section>}
   {!active.length&&!closed.length&&<p className="coti-clean-empty">No hay cotizaciones compartidas.</p>}
  </>}
  <p className="coti-profile-privacy">Los originales y el acceso a la cuenta permanecen privados.</p>
 </section>;
}
