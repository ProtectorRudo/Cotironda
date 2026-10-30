'use client';
import {useState} from 'react';
import {
 evaluarAuditoriaSesion, type AtributosCookie, type InformeSeguridad
} from '../../../../src/server/browser-cookie-cache-audit.ts';

/**
 * Auditoría ejecutada SOLO en el navegador autenticado del propietario.
 *
 * CookieStore.getAll() devuelve objetos que incluyen valores de cookies;
 * únicamente se extraen los cuatro atributos públicos enumerados aquí,
 * descartando inmediatamente los valores. Jamás se imprimen ni envían.
 */
type CookieStoreMinimo={
 getAll:()=>Promise<readonly {
  name:string; secure?:boolean; sameSite?:string; path?:string;
 }[]>;
};
type VentanaCookies=Window & {cookieStore?: CookieStoreMinimo};

export function AuditoriaSeguridadSesion({projectRef}:{projectRef:string}) {
  const [revisando,setRevisando]=useState(false);
  const [resultado,setResultado]=useState<InformeSeguridad|null>(null);
  const [error,setError]=useState(false);
  async function auditar(){
    if(revisando)return;
    setRevisando(true);setResultado(null);setError(false);
    try {
      if(window.location.protocol!=='https:'){
        setError(true);return;
      }

      // CookieStore no está disponible en todos los navegadores: ausencia
      // significa INCONCLUSO, nunca una aprobación.
      let atributos: AtributosCookie[] | null = null;
      const store=(window as unknown as VentanaCookies).cookieStore;
      if(store && typeof store.getAll==='function'){
        try {
          const all=await store.getAll();
          atributos=all.map(({name,secure,sameSite,path})=>({
            name,secure,sameSite,path
          }));
        }catch{
          atributos=null;
        }
      }

      // Petición únicamente al mismo origen y ruta ya autorizada. No se
      // inspecciona el body, ni Set-Cookie (prohibido por browser Fetch).
      const res=await fetch('/alta',{
        method:'GET',
        credentials:'same-origin',
        cache:'no-store',
        redirect:'follow',
        referrerPolicy:'no-referrer'
      });
      const final=new URL(res.url);
      setResultado(evaluarAuditoriaSesion(atributos,projectRef,{
        https:final.protocol==='https:',
        mismoOrigen:final.origin===window.location.origin,
        rutaFinal:final.pathname,
        status:res.status,
        redirigio:res.redirected,
        cacheControl:res.headers.get('cache-control'),
        vercelCache:res.headers.get('x-vercel-cache')
      }));
    }catch{
      setError(true);
    }finally{
      setRevisando(false);
    }
  }
  return <section aria-label="Auditoría de cookies y caché" style={{marginTop:'1.75rem'}}>
    <h2 style={{fontSize:'1.15rem'}}>Comprobación de seguridad HTTPS</h2>
    <p className="muted">La prueba se realiza en este navegador. No muestra ni envía
      contraseñas, JWT ni valores de cookies.</p>
    <button type="button" onClick={()=>void auditar()} disabled={revisando}>
      {revisando?'Comprobando...':'Comprobar cookies y caché'}
    </button>
    {error&&<p className="feedback" role="status">INCONCLUSO: no se pudo completar
      la comprobación. No significa que la sesión sea insegura.</p>}
    {resultado&&<div role="status" aria-live="polite">
      <p><strong>Resultado general: {resultado.general}</strong></p>
      <p>Cookie Secure, SameSite=Lax y Path=/: <strong>{resultado.cookies}</strong></p>
      <p>Respuesta privada sin caché compartida: <strong>{resultado.cache}</strong></p>
      <p>Ruta privada accesible con la sesión actual: <strong>{resultado.paginaPrivada}</strong></p>
      <p className="muted">INCONCLUSO significa que el navegador no permite comprobar
        algún atributo. Esta prueba no puede leer la cabecera Set-Cookie ni
        certificar HttpOnly. Tampoco reemplaza la auditoría de los servidores.</p>
    </div>}
  </section>;
}
