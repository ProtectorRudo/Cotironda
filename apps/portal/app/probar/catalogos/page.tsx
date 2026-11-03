import Link from 'next/link';
import {DemoCatalogosPilotoMvp069} from './demo-catalogos';
import '../mvp.css';
import './catalogos.css';

export const metadata={
 title:'Catálogos de corralones · prueba Cotironda',
 description:'Probá cómo se interpreta un listado CSV/TXT de cada negocio y se seleccionan proveedores sin enviar WhatsApp.',
 robots:{index:false,follow:false}
};
export default function ProbarCatalogos(){
 return <main className="mvp-page"><div className="mvp-container">
  <nav className="mvp-back"><Link href="/probar">← Volver a las pruebas</Link></nav>
  <div className="mvp-hero"><div className="mvp-hero-copy">
   <p className="mvp-overline">COTIRONDA · CARGA DE CATÁLOGOS</p>
   <h1>¿Qué vende cada <span>corralón?</span></h1>
   <p>Cargá dos listados y comprobá a quién consultaría Cotironda cuando el arquitecto envía su pedido.</p>
  </div><div className="mvp-hero-aside">
   <span className="mvp-demo-mark">PRUEBA LOCAL · SIN WHATSAPP REAL</span>
   <strong>Los negocios informan materiales, no precios.</strong>
   <p>El sistema marca los productos que no reconoce para revisión.</p>
  </div></div>
  <aside className="mvp-banner" role="note">
   <strong>Esta pantalla es un ensayo en tu navegador.</strong>
   {' '}No guarda catálogos en Supabase, no verifica identidades y no realiza envíos. Admite CSV exportado de Excel y TXT;
   para XLSX, PDF y fotos todavía falta el cargador privado. Ningún producto queda habilitado comercialmente.
  </aside>
  <DemoCatalogosPilotoMvp069/>
 </div></main>;
}
