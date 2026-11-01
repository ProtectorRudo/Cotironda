'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import type {RondaPropiaMvp014}
 from '../../../../src/server/mis-rondas-http-mvp014.ts';

type Estado='cargando'|'listo'|'acceso'|'no_disponible'|'error';
const status:Record<RondaPropiaMvp014['round_status'],string>={
 abierta:'Recibiendo cotizaciones',programada:'Próxima a comenzar',
 cerrada:'Ronda cerrada',cancelada:'Cancelada'
};
export function MisRondasComprador(){
 const [estado,setEstado]=useState<Estado>('cargando');
 const [rondas,setRondas]=useState<readonly RondaPropiaMvp014[]>([]);
 const load=useCallback(async(signal?:AbortSignal)=>{
  setEstado('cargando');
  try{
   const r=await fetch('/api/rondas',{credentials:'same-origin',cache:'no-store',signal});
   if(signal?.aborted)return;
   if(!r.ok){
    setEstado(r.status===401?'acceso':r.status===503?'no_disponible':'error');
    setRondas([]);return;
   }
   const data=await r.json() as {rondas:readonly RondaPropiaMvp014[]};
   if(signal?.aborted)return;
   setRondas(data.rondas);setEstado('listo');
  }catch{
   if(!signal?.aborted)setEstado('error');
  }
 },[]);
 useEffect(()=>{
  const controller=new AbortController();
  void load(controller.signal);
  return()=>controller.abort();
 },[load]);
 return <section style={{maxWidth:950,margin:'0 auto'}}>
  <nav style={{marginBottom:28,fontSize:14}}><Link href="/" style={{color:'#a5c7ff'}}>
    ← Cotironda</Link></nav>
  <p style={{color:'#99c5ff',fontSize:12,fontWeight:800}}>TU EMPRESA</p>
  <h1 style={{fontSize:'clamp(30px, 5vw, 43px)',margin:'8px 0 10px'}}>Mis solicitudes</h1>
  <p style={{color:'#b8cde0',lineHeight:1.6,marginBottom:26}}>
   Revisá las ofertas de tus pedidos. Los proveedores aparecen anónimos
   durante la ronda y vos decidís a quién comprarle.
  </p>
  {estado!=='listo'&&<div role="status" style={{padding:20,background:'#162e48',borderRadius:12}}>
   {estado==='cargando'?'Consultando tus solicitudes…':
    estado==='acceso'?'Iniciá sesión para ver las solicitudes de tu empresa.':
    estado==='no_disponible'?'La consulta de rondas reales todavía no está habilitada en este entorno.':
    'No se pudieron cargar tus solicitudes.'}
   {estado==='acceso'&&<p><Link href="/ingresar" style={{color:'#b4d5ff'}}>Ingresar</Link></p>}
   {estado==='error'&&<button type="button" onClick={()=>void load()}
    style={{padding:12,marginTop:12}}>Reintentar</button>}
  </div>}
  {estado==='listo'&&<>
   {rondas.length===0?<div style={{padding:20,background:'#162e48',borderRadius:12}}>
    Todavía no tenés solicitudes registradas. No se muestran pedidos ficticios.
   </div>:<div style={{display:'grid',gap:12}}>
    {rondas.map(r=><article key={r.round_id}
     style={{background:'#162e48',border:'1px solid #315270',borderRadius:15,
      padding:18,display:'flex',flexWrap:'wrap',alignItems:'center',
      justifyContent:'space-between',gap:15}}>
     <div><strong style={{display:'block',fontSize:17}}>{status[r.round_status]}</strong>
      <span style={{color:'#b8cee0',fontSize:13}}>
       {r.item_count} {r.item_count===1?'material':'materiales'} ·
       Ronda {r.round_id.slice(0,8)}
      </span></div>
     <Link href={'/rondas/'+r.round_id+'/ofertas'}
      style={{color:'white',background:'#236acb',borderRadius:9,
       padding:'12px 16px',fontSize:13,fontWeight:750,textDecoration:'none'}}>
       Ver cotizaciones
     </Link>
    </article>)}
   </div>}
  </>}
 </section>;
}
