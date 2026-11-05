import {originalesHTTPHabilitados} from '../../../../../../src/server/originales-piloto-http-runtime.ts';
import {rutaOriginalPilotoMvp207} from
 '../../../../../../src/domain/acceso-comprador-originales-mvp207.ts';
import {VistaOriginalesPiloto} from './vista-originales';

export const dynamic='force-dynamic';
export const revalidate=0;
export const metadata={
 title:'Originales autorizados · Cotironda PILOTO',
 robots:{index:false,follow:false,noarchive:true}
};
/** No buyer browser Auth or OTP request is possible until a separately
 * approved, immutable Vercel preview release with PILOT SQL policy OFF by
 * default has been installed. This is not the DEV registration portal. */
export default async function PaginaOriginalesPiloto({
 params
}:Readonly<{params:Promise<{rondaId:string}>}>){
 const {rondaId}=await params;
 const enabled=originalesHTTPHabilitados(process.env);
 if(!enabled||!rutaOriginalPilotoMvp207(rondaId))
  return <main className="panel" style={{maxWidth:760}}>
   <span className="eyebrow">PILOTO · ACCESO PRIVADO</span>
   <h1>Originales no habilitados</h1>
   <p>La descarga de presupuestos originales no está disponible
    en este entorno. Las solicitudes y ofertas siguen protegidas.</p>
  </main>;
 // These two credentials are deliberately PUBLISHABLE. Never forward any
 // service_role/secret key to the client; all original bytes come from
 // independently authorized same-origin API routes.
 const url=process.env.COTIRONDA_PILOT_SUPABASE_URL!;
 const publishableKey=process.env.COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY!;
 return <main><VistaOriginalesPiloto
  rondaId={rondaId} url={url} publishableKey={publishableKey}/></main>;
}
