import Link from 'next/link';
import {PilotoNavegableMvp038} from './piloto-navegable';
import '../mvp.css';
import './piloto.css';

export const metadata={
 title:'Prueba integral · Cotironda',
 description:'Recorrido ficticio, sin WhatsApp ni compras: pedido, dos respuestas, comparación y elección.'
};
export default function PaginaPilotoNavegable(){
 return <main className="mvp-page">
  <div className="mvp-container">
   <nav className="mvp-back"><Link href="/">← Cotironda</Link></nav>
   <div className="mvp-hero m038-hero">
    <div className="mvp-hero-copy">
     <p className="mvp-overline">COTIRONDA · ENSAYO COMPLETO</p>
     <h1>De tu lista a una decisión.<br/><span>Probalo vos.</span></h1>
     <p>Prepará el pedido, mirá qué recibirían dos proveedores ficticios, simulá sus presupuestos y compará sin mezclar precios incomparables.</p>
    </div>
    <div className="mvp-hero-aside">
     <span className="mvp-demo-mark">SIMULACIÓN</span>
     <strong>Una ronda completa.</strong>
     <p>Solo datos de prueba. Nada se envía, guarda, compra ni adjudica.</p>
    </div>
   </div>
   <aside className="mvp-banner" role="note">
    <strong>Prueba ficticia dentro de tu navegador.</strong>
    {' '}No ingreses datos personales ni presupuestos comerciales. Los dos proveedores y sus precios son ejemplos editables. No se envía WhatsApp ni se registra una ronda real.
   </aside>
   <PilotoNavegableMvp038/>
  </div>
 </main>;
}
