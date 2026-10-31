import Link from 'next/link';
import {EjemploOfertas} from './ejemplo-ofertas';
import '../mvp.css';
import './ofertas.css';

export const metadata={
  title:'Comparación de ofertas · Demo Cotironda',
  description:'Demostración local y ficticia de cobertura, precios finales y elección manual; sin envíos ni adjudicaciones.'
};
export default function PaginaOfertasDemo(){
  return <main className="mvp-page">
    <div className="mvp-container">
      <nav className="mvp-back"><Link href="/probar">← Volver a tu pedido</Link></nav>
      <div className="mvp-hero mc-hero">
        <div className="mvp-hero-copy">
          <p className="mvp-overline">COTIRONDA · PRUEBA DEL COMPRADOR</p>
          <h1>Cotizaciones claras.<br/><span>Decisiones simples.</span></h1>
          <p>Mirá cómo comparar presupuestos completos y parciales sin confundir el precio más bajo con el mejor presupuesto.</p>
        </div>
        <div className="mvp-hero-aside">
          <span className="mvp-demo-mark">100 % FICTICIO</span>
          <strong>IVA y flete incluidos.</strong>
          <p>Podés elegir una combinación, pero no se registra ni se envía nada.</p>
        </div>
      </div>
      <aside className="mvp-banner" role="note"><strong>Datos inventados para probar la interfaz.</strong> No ingreses presupuestos reales. No hay proveedores conectados ni ofertas recibidas por WhatsApp.</aside>
      <EjemploOfertas/>
    </div>
  </main>;
}
