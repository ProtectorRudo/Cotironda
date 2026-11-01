import Link from 'next/link';
import {DemostracionComprador} from './demo-comprador';
import './mvp.css';
export const metadata={
  title:'Probá Cotironda · Pedido de materiales',
  description:'Demostración local de clasificación de materiales y selección de comercios ficticios, sin envíos.'
};
export default function Probar(){
 return <main className="mvp-page">
   <div className="mvp-container">
     <nav className="mvp-back"><Link href="/">← Volver a Cotironda</Link></nav>
     <div className="mvp-hero">
       <div className="mvp-hero-copy">
         <p className="mvp-overline">COTIRONDA · PRIMERA EXPERIENCIA</p>
         <h1>Pedí materiales.<br/><span>Sin dar mil vueltas.</span></h1>
         <p>Copiá tu lista y mirá cómo Cotironda identifica productos, separa rubros y prepara la consulta para cada comercio.</p>
       </div>
       <div className="mvp-hero-aside">
         <span className="mvp-demo-mark">DEMO</span>
         <strong>Un pedido.<br/>Distintos proveedores.</strong>
         <p>Sin Excel obligatorio, sin elegir rubros y sin cursos.</p>
       </div>
     </div>
     <aside className="mvp-banner" role="note">
       <strong>Demostración con proveedores ficticios.</strong>
       <span> No ingreses datos personales ni presupuestos comerciales. No hay envíos, precios reales, IA externa ni adjudicaciones.</span>
     </aside>
     <p><a href="/probar/whatsapp" className="mvp-tag">Ver nuevo prototipo WhatsApp (3 comercios)</a></p>
     <p><a href="/probar/catalogos" className="mvp-tag">Probar carga de listados de corralones (CSV/TXT)</a></p>
     <DemostracionComprador/>
   </div>
 </main>;
}
