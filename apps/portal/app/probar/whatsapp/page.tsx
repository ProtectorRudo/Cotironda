import Link from 'next/link';
import {PrototipoWhatsappCuatroTelefonosMvp065} from './prototipo-whatsapp';
import '../mvp.css';
import './prototipo.css';

export const metadata={
 title:'Prototipo WhatsApp · Cotironda',
 description:'Simulación móvil de un arquitecto y tres proveedores, sin WhatsApp real ni datos guardados.',
 robots:{index:false,follow:false}
};
export default function PrototipoWhatsApp(){
 return <main className="mvp-page"><div className="mvp-container">
  <nav className="mvp-back"><Link href="/">← Cotironda</Link></nav>
  <div className="mvp-hero">
   <div className="mvp-hero-copy">
    <p className="mvp-overline">COTIRONDA · PROTOTIPO WHATSAPP</p>
    <h1>Un WhatsApp.<br/><span>Tres presupuestos.</span></h1>
    <p>Viví el recorrido de un arquitecto y tres comercios: envío,
     cotizaciones completas, comparación honesta y contacto al cierre.</p>
   </div>
   <div className="mvp-hero-aside">
    <span className="mvp-demo-mark">SIMULACIÓN · 4 PARTICIPANTES</span>
    <strong>Sin formularios para los negocios.</strong>
    <p>Responden por WhatsApp. Todos los renglones y totales se respetan.</p>
   </div>
  </div>
  <aside className="mvp-banner" role="note">
   <strong>Esta es una simulación que funciona dentro de tu navegador.</strong>
   {' '}Los tres proveedores y sus precios son ficticios. No envía ni recibe
   mensajes de Whapi, no guarda presupuestos, no revela teléfonos y no activa compras.
   No pegues datos personales, tokens ni presupuestos comerciales verdaderos.
  </aside>
  <PrototipoWhatsappCuatroTelefonosMvp065/>
 </div></main>;
}
