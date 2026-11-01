import Link from 'next/link';
import {PreciosRealesComprador} from './precios-reales-comprador';
export const dynamic='force-dynamic';
export const revalidate=0;
export const metadata={
 title:'Cotizaciones recibidas · Cotironda',
 description:'Solo para compradores autenticados: ofertas reales anónimas recibidas para una ronda propia'
};
export default async function PaginaOfertasRecibidas({
 params
}:{params:Promise<{rondaId:string}>}){
 const {rondaId}=await params;
 return <main className="mvp014-page">
  <nav className="mvp014-nav"><Link href="/">Cotironda</Link>
   <span> / Cotizaciones recibidas</span></nav>
  <PreciosRealesComprador rondaId={rondaId}/>
 </main>;
}
