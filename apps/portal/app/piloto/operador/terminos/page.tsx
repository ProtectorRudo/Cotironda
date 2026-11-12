import {notFound} from 'next/navigation';
import {revisionMfaHTTPHabilitada}
 from '../../../../../../src/server/whapi-terms-mfa-http-p0.ts';
import {PanelRevisionTerminos} from './panel-revision';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export const metadata={
 title:'Cotironda · Revisión privada de consentimientos',
 robots:{index:false,follow:false,noarchive:true}
};
export default function RevisionOperadorPage(){
 if(!revisionMfaHTTPHabilitada(process.env))notFound();
 // Publishable key is intended for public/browser usage. No JWT, DB URL,
 // AES key or service_role key can ever be sent as a prop.
 const publishableKey=process.env.COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY!;
 return <main className="wrap" style={{maxWidth:780,paddingBlock:30}}>
  <h1>Revisión privada de consentimientos</h1>
  <p>Acceso exclusivo para operadores habilitados con doble factor.
   Esta pantalla no autoriza nada automáticamente.</p>
  <PanelRevisionTerminos publishableKey={publishableKey}/>
 </main>;
}
