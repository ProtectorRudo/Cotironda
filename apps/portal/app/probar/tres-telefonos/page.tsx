import Link from 'next/link';
import {EnsayoTresTelefonosMvp071} from './ensayo-tres-telefonos';
import '../mvp.css';
import './piloto-tres.css';
export const metadata={
 title:'Piloto 1 arquitecto y 2 corralones · Cotironda',
 description:'Ensayo local completo sin datos reales: dos catálogos iguales, consultas, presupuestos originales.',
 robots:{index:false,follow:false}
};
export default function PilotoTres(){
 return <main className="mvp-page"><div className="mvp-container">
  <nav className="mvp-back"><Link href="/probar">← Volver a las pruebas</Link></nav>
  <div className="mvp-hero"><div className="mvp-hero-copy">
   <p className="mvp-overline">COTIRONDA · PILOTO DE TRES PARTICIPANTES</p>
   <h1>Un arquitecto.<br/><span>Dos corralones.</span></h1>
   <p>El mismo catálogo amplio para los dos negocios, un pedido y dos presupuestos originales que nunca se alteran.</p>
  </div><div className="mvp-hero-aside">
   <span className="mvp-demo-mark">ENSAYO LOCAL · SIN CONEXIÓN</span>
   <strong>Un solo recorrido.</strong>
   <p>Probá la selección por materiales y la fidelidad de los presupuestos.</p>
  </div></div>
  <EnsayoTresTelefonosMvp071/>
 </div></main>;
}
