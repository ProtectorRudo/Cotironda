import type { Metadata } from 'next';
import './styles.css';
export const metadata: Metadata = {
  title: 'Cotironda · Portal en desarrollo',
  description: 'Registro de compradores y proveedores de materiales de obra. Etapa de desarrollo.',
  robots: { index: false, follow: false }
};
export default function Layout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="es-AR"><body><header className="top"><div className="wrap"><a className="logo" href="/">COTI<span>RONDA</span></a><span className="status">ENTORNO DE DESARROLLO · ETAPA 01</span></div></header>{children}<footer className="foot">Cotironda · Registro en desarrollo. Sin licitaciones reales ni pagos.</footer></body></html>;
}
