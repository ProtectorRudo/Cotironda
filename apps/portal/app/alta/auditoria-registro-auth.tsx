'use client';
import {useState} from 'react';
import {
 comprobarRegistroAuthSoloLectura,
 type ResultadoAuthSignup
} from '../../../../src/server/auth-signup-readonly-audit.ts';
import {COTIRONDA_DEV_REF} from '../../../../src/server/portal-entorno.ts';

/**
 * SOLO para cuentas de ensayo confirmadas en la Preview SSO.
 * Nunca POST /auth/v1/signup, nunca creación ni correos de confirmación.
 */
export function AuditoriaRegistroAuth(){
 const [busy,setBusy]=useState(false);
 const [result,setResult]=useState<ResultadoAuthSignup|null>(null);
 async function verificar(){
  if(busy)return;
  setBusy(true);setResult(null);
  try{
   const url=process.env.NEXT_PUBLIC_SUPABASE_URL??'';
   const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??'';
   const estado=await comprobarRegistroAuthSoloLectura({
    projectRef:COTIRONDA_DEV_REF,url,publishableKey
   });
   setResult(estado);
  }catch{
   setResult({estado:'INCONCLUSO',codigo:'configuracion_no_verificable'});
  }finally{setBusy(false);}
 }
 return <section aria-label="Diagnóstico público de autorregistro Auth"
   style={{marginTop:'1.75rem'}}>
   <h2 style={{fontSize:'1.15rem'}}>Autorregistro directo de Supabase Auth</h2>
   <p className="muted">Esta comprobación lee únicamente la configuración pública
    de Auth. No intenta crear cuentas ni envía datos personales.</p>
   <button type="button" disabled={busy} onClick={()=>void verificar()}>
    {busy?'Comprobando Auth...':'Comprobar autorregistro Auth'}
   </button>
   {result&&<div role="status" aria-live="polite">
    <p><strong>Resultado: {result.estado}</strong></p>
    {result.estado==='PASS'&&<p>El servicio Auth informa que el
      autorregistro general está deshabilitado.</p>}
    {result.estado==='FAIL'&&<p>Advertencia: Supabase Auth informa que
      admite autorregistro directo. La creación de empresas en Cotironda
      sigue bloqueada por separado; hay que revisar Auth antes del piloto.</p>}
    {result.estado==='INCONCLUSO'&&<p>No se pudo comprobar la
      configuración remota. No significa que el autorregistro esté cerrado.</p>}
    <p className="muted">La prueba inspecciona solo el campo público
      disable_signup. No valida protecciones antiabuso ni cuotas de Auth.</p>
   </div>}
 </section>;
}
