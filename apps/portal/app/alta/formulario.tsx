'use client';
import { useState, type FormEvent } from 'react';
type Tipo='buyer'|'supplier'|'both';
export function FormularioEmpresa(){
  const [nombre,setNombre]=useState(''),[tipo,setTipo]=useState<Tipo>('buyer'),[comercial,setComercial]=useState('');
  const [requestId,setRequestId]=useState<string|null>(null),[busy,setBusy]=useState(false),[mensaje,setMensaje]=useState('');
  function cambia(setter:(v:string)=>void,value:string){setter(value);setRequestId(null);}
  async function enviar(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy)return;setBusy(true);setMensaje('');
    const id=requestId||crypto.randomUUID();setRequestId(id);
    try {
      const respuesta=await fetch('/api/organizaciones',{
        method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
        body:JSON.stringify({requestId:id,nombre,tipo,...(tipo==='buyer'?{}:{nombreComercial:comercial})})
      });
      const data: {error?:string;organizationId?:string} = await respuesta.json();
      if(respuesta.ok) setMensaje('Empresa registrada correctamente. ID: '+data.organizationId);
      else if(respuesta.status===503) setMensaje('El registro no está disponible todavía. No se guardó ningún dato.');
      else if(respuesta.status===429) setMensaje('Límite de solicitudes alcanzado. Consultá soporte.');
      else setMensaje('No se pudo registrar: '+(data.error||'solicitud rechazada'));
    }catch{setMensaje('No se pudo conectar. No cambies los datos si vas a reintentar.');}
    finally{setBusy(false);}
  }
  return <form onSubmit={enviar}>
    <label htmlFor="empresa">Nombre de empresa</label><input id="empresa" required maxLength={160} minLength={2} value={nombre} onChange={e=>cambia(setNombre,e.target.value)}/>
    <label htmlFor="tipo">¿Qué tipo de cuenta necesitás?</label>
    <select id="tipo" value={tipo} onChange={e=>{setTipo(e.target.value as Tipo);setRequestId(null)}}>
      <option value="buyer">Arquitecto / constructora / comprador</option><option value="supplier">Proveedor de materiales</option><option value="both">Comprador y proveedor</option>
    </select>
    {tipo!=='buyer'&&<><label htmlFor="comercial">Nombre comercial</label><input id="comercial" minLength={2} maxLength={160} required value={comercial} onChange={e=>cambia(setComercial,e.target.value)}/></>}
    <button disabled={busy} type="submit">{busy?'Validando...':'Registrar empresa'}</button>
    {mensaje&&<p className="feedback" role="status">{mensaje}</p>}
    <p className="muted">El registro exige correo confirmado y una base privada de Cotironda. No se habilitan cotizaciones automáticamente.</p>
  </form>;
}
