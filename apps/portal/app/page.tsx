import Link from 'next/link';
export default function Inicio() {
  return <main className="wrap hero">
    <span className="eyebrow">COMPRA DE MATERIALES · ARGENTINA</span>
    <h1>Un solo pedido.<br/><span>Las ofertas que necesitás.</span></h1>
    <p>Cotironda busca simplificar la compra de materiales: vos mandás una lista y el sistema prepara las consultas por producto y rubro. Primero estamos probando el recorrido con catálogos ficticios, sin ventas ni mensajes reales.</p>
    <div className="actions">
      <Link href="/probar/whatsapp" className="button">Probar WhatsApp con 3 comercios</Link>
      <Link href="/probar/piloto" className="button outline">Probar una ronda completa</Link>
      <Link href="/probar" className="button outline">Ver demo simple</Link>
      <Link href="/ingresar" className="button outline">Acceder al portal de prueba</Link>
    </div>
    <div className="notice"><b>Entorno de desarrollo.</b> En la demostración, el texto se interpreta en tu navegador y no se envía ni se guarda. No cargues datos privados ni presupuestos comerciales. El envío de solicitudes a proveedores todavía no está activo.</div>
  </main>;
}
