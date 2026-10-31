import Link from 'next/link';
import { entornoAuthConfigurado, entornoAuthSoloIngresoPreview } from '@/lib/supabase/server';
import { AccesoPrueba } from './acceso-prueba';
import { Acceso } from './acceso';
export default function PaginaIngresar() {
  const listo=entornoAuthConfigurado();
  const soloPrueba=entornoAuthSoloIngresoPreview();
  return <main className="panel"><span className="eyebrow">ACCESO A COTIRONDA</span><h1>Ingresá a tu empresa</h1><p>{soloPrueba?'Ingresá con una de las cuentas de ensayo ya creadas. No se habilitarán nuevas altas.':'Creá una cuenta para administrar solicitudes y materiales cuando habilitemos el entorno de pruebas.'}</p>
    {listo?(soloPrueba?<AccesoPrueba/>:<Acceso/>):<div className="notice"><strong>Acceso y registro cerrados temporalmente.</strong> Todavía no está configurada una base Supabase exclusiva de Cotironda. No ingreses información personal en este entorno.</div>}
    <p className="muted"><Link href="/">Volver al inicio</Link></p>
  </main>;
}
