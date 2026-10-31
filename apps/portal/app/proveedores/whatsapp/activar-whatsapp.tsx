'use client';
import {useState} from 'react';

type Org=Readonly<{id:string;name:string}>;
export function ActivarWhatsAppProveedor({
 organizaciones
}:Readonly<{organizaciones:readonly Org[]}>){
 const [empresa,setEmpresa]=useState(organizaciones[0].id);
 const [enviando,setEnviando]=useState(false);
 const [error,setError]=useState('');
 async function activar(){
  if(enviando)return;
  setEnviando(true);setError('');
  try{
   const res=await fetch('/api/proveedores/whatsapp/enlace',{
    method:'POST',credentials:'same-origin',
    headers:{'content-type':'application/json'},
    cache:'no-store',referrerPolicy:'no-referrer',
    body:JSON.stringify({supplierOrgId:empresa})
   });
   if(!res.ok)throw Error(res.status===429?'demasiados_intentos':'fallo');
   const value:unknown=await res.json();
   if(value===null||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).length!==2||!('url' in value)||
    !('venceEnSegundos' in value)||typeof value.url!=='string'||
    value.venceEnSegundos!==900)throw Error('respuesta_invalida');
   const u=new URL(value.url);
   if(u.origin!=='https://wa.me'||!/^\/[1-9][0-9]{8,14}$/u.test(u.pathname)||
    u.searchParams.size!==1||
    !/^COTI ALTA [a-f0-9]{32}$/u.test(u.searchParams.get('text')??''))
     throw Error('enlace_invalido');
   // Same-window navigation works on mobile after asynchronous HTTP.
   window.location.assign(u.toString());
  }catch(e){
   setError(e instanceof Error&&e.message==='demasiados_intentos'?
    'Por seguridad, alcanzaste el límite de intentos. Intentá más tarde.':
    'No pudimos preparar el enlace. No se registró ningún WhatsApp. Intentá nuevamente.');
   setEnviando(false);
  }
 }
 return <div className="pw-activate">
  {organizaciones.length>1&&<div className="pw-picker">
   <label htmlFor="pw-company">¿Qué negocio querés activar?</label>
   <select id="pw-company" value={empresa} disabled={enviando}
    onChange={e=>setEmpresa(e.target.value)}>
    {organizaciones.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
   </select>
  </div>}
  {organizaciones.length===1&&<p className="pw-shop">
   <span>Tu negocio</span><strong>{organizaciones[0].name}</strong></p>}
  <button className="pw-cta" type="button" onClick={activar} disabled={enviando}>
   {enviando?'Preparando enlace…':'Activar mi WhatsApp'}
  </button>
  <p className="pw-hint">El mensaje se abre listo para enviar. Usá el WhatsApp del comercio.
   El enlace vence a los 15 minutos.</p>
  {error&&<p className="pw-error" role="alert">{error}</p>}
 </div>;
}
