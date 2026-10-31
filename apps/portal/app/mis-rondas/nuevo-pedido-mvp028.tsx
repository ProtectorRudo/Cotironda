'use client';
import {useRef,useState,type FormEvent} from 'react';
import {prepararPedidoTextoMvp028,type PedidoPilotoMvp028}
 from '../../../../src/domain/pedido-piloto-mvp028.ts';

type State='idle'|'sending'|'saved';
export function NuevoPedidoMvp028(){
 const [text,setText]=useState('');
 const [zone,setZone]=useState('');
 const [view,setView]=useState<PedidoPilotoMvp028|null>(null);
 const [state,setState]=useState<State>('idle');
 const [error,setError]=useState('');
 const [saved,setSaved]=useState('');
 const requestId=useRef<string|null>(null);
 const reset=()=>{
  requestId.current=null;
  setView(null);setError('');setSaved('');setState('idle');
 };
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(state==='sending'||state==='saved')return;
  setError('');
  let prepared:PedidoPilotoMvp028;
  try{prepared=prepararPedidoTextoMvp028(text,zone||null);}
  catch{
   setError('Ingresá una lista de hasta 4.000 caracteres, con cantidades y materiales.');
   return;
  }
  setView(prepared);
  if(prepared.estado!=='listo_para_registrar'||!prepared.zonaEntrega){
   setError('Revisá los renglones indicados. No vamos a guardar ni perder materiales sin reconocer.');
   return;
  }
  if(!requestId.current)requestId.current=crypto.randomUUID();
  setState('sending');
  try{
   const response=await fetch('/api/rondas',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
     requestId:requestId.current,deliveryZone:prepared.zonaEntrega,
     vatRequest:prepared.vatRequest,items:prepared.items
    })
   });
   if(!response.ok){
    if(response.status===401)throw Error('Ingresá con una cuenta de comprador para continuar.');
    if(response.status===503)throw Error('El registro de solicitudes todavía no está disponible en este entorno.');
    throw Error('No pudimos registrar el pedido. Probá nuevamente.');
   }
   const data:unknown=await response.json();
   if(data===null||typeof data!=='object'||Array.isArray(data)||
    !('roundId' in data)||typeof data.roundId!=='string'||
    !('invitationsSent' in data)||data.invitationsSent!==0||
    !('status' in data)||data.status!=='programada')
    throw Error('No pudimos verificar el registro del pedido.');
   setSaved(data.roundId);
   setState('saved');
  }catch(e){
   setError(e instanceof Error?e.message:'No pudimos registrar el pedido.');
   setState('idle'); // keep request UUID for exact idempotent retry
  }
 }
 return <section style={{margin:'0 auto 32px',maxWidth:950,padding:20,
  background:'#142a42',border:'1px solid #315270',borderRadius:16}}>
  <p style={{color:'#9dcdff',fontWeight:750,fontSize:12}}>PRIMER PEDIDO · PILOTO</p>
  <h2 style={{fontSize:'clamp(23px,4vw,31px)',margin:'7px 0 8px'}}>Pedí presupuestos</h2>
  <p style={{color:'#b8cde0',marginBottom:16,lineHeight:1.5}}>
   Pegá los materiales como los tenés. Cotironda conserva las especificaciones
   originales. Si hay algo dudoso, te lo indica sin mandar pedidos incompletos.
  </p>
  {state==='saved'?<div role="status" style={{background:'#173d34',
   padding:16,borderRadius:11}}>
   <strong>Pedido registrado correctamente.</strong>
   <p>Guardamos los materiales y la zona. Todavía no se enviaron mensajes
    a proveedores: el despacho está deshabilitado hasta activar el piloto.</p>
   <small>Solicitud {saved.slice(0,8)}</small>
  </div>:<form onSubmit={submit}>
   <label htmlFor="pedido-lista-028" style={{display:'block',fontWeight:750,marginBottom:8}}>
    Lista de materiales
   </label>
   <textarea id="pedido-lista-028" value={text} maxLength={4000} rows={5}
    disabled={state==='sending'} onChange={e=>{setText(e.target.value);reset();}}
    placeholder={'20 bolsas de cemento CPC 50 kg\n5 litros de pintura látex interior\n15 placas de yeso RH 12,5 mm'}
    style={{display:'block',width:'100%',boxSizing:'border-box',background:'#0b1829',
     border:'1px solid #668baa',borderRadius:10,color:'white',padding:12,
     fontSize:16,lineHeight:1.5,resize:'vertical'}}/>
   <label htmlFor="pedido-zona-028" style={{display:'block',fontWeight:750,
    margin:'16px 0 8px'}}>Localidad de entrega</label>
   <input id="pedido-zona-028" value={zone} maxLength={65}
    autoComplete="address-level2" disabled={state==='sending'}
    placeholder="Ej.: La Plata" onChange={e=>{setZone(e.target.value);reset();}}
    style={{display:'block',width:'100%',boxSizing:'border-box',background:'#0b1829',
     border:'1px solid #668baa',borderRadius:10,color:'white',padding:12,fontSize:16}}/>
   <p style={{fontSize:12,color:'#a9c6e0'}}>Podés incluir «Entrega en: La Plata»
    en el texto. La localidad es necesaria para buscar proveedores correctos.</p>
   {view?.pendientes?.length?<div role="alert"
    style={{background:'#4a3027',borderRadius:10,padding:12,marginTop:10}}>
    <strong>Hay {view.pendientes.length} aclaraciones necesarias:</strong>
    <ul>{view.pendientes.map((p,i)=><li key={i}>
     {p.linea>0?'Línea '+p.linea+': ':''}{p.motivo}</li>)}</ul>
   </div>:null}
   {error&&<p role="alert" style={{color:'#ffcfbf'}}>{error}</p>}
   <button type="submit" disabled={state==='sending'}
    style={{marginTop:14,background:'#287ce5',color:'white',border:0,
     borderRadius:10,padding:'14px 22px',fontSize:16,fontWeight:800,cursor:'pointer'}}>
    {state==='sending'?'Registrando…':'Pedir presupuestos'}
   </button>
  </form>}
  <p style={{color:'#a9c6e0',fontSize:12,marginTop:14}}>
   El pedido se guarda de manera privada. No se contacta a ningún comercio
   hasta que el envío real esté habilitado y verificado.
  </p>
 </section>;
}
