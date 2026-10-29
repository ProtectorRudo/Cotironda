import Link from 'next/link';
export default function Inicio() {
  return <main className="wrap hero"><span className="eyebrow">COMPRA DE MATERIALES · ARGENTINA</span><h1>Un solo pedido.<br/><span>Las ofertas que necesitás.</span></h1><p>Estamos desarrollando el portal para arquitectos, constructoras y proveedores. El registro permanecerá cerrado hasta terminar las pruebas con una base exclusiva de Cotironda.</p><div className="actions"><Link href="/ingresar" className="button">Acceder al portal</Link><Link href="https://cotironda.vercel.app" className="button outline">Ver demostración</Link></div><div className="notice"><b>Versión de desarrollo.</b> No cargues datos comerciales ni presupuestos reales.</div></main>;
}
