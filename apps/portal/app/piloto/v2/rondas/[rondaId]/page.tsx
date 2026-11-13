import {notFound} from 'next/navigation';
import {ingresoCompradorV2Habilitado,respuestasV2Habilitadas}
 from '../../../../../../../src/server/v2-03-respuestas-http.ts';
import {RespuestasCompradorV2} from './respuestas-comprador';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;

/** Vista real y privada. Deshabilitada sin flags de preview + SHA exacto. */
export default async function PaginaRespuestasV2(
 {params}:{params:Promise<{rondaId:string}>}
){
 const {rondaId}=await params;
 if(!UUID.test(rondaId)||!ingresoCompradorV2Habilitado(process.env))
  notFound();
 return <main className="panel">
  <span className="eyebrow">COTIRONDA · SEGUIMIENTO PRIVADO</span>
  <h1>Presupuestos recibidos</h1>
  <p>Ingresá con tu teléfono autorizado para consultar el estado del pedido.
    La identidad se verifica por SMS; no se muestran presupuestos
    hasta que la función privada esté habilitada.</p>
  <RespuestasCompradorV2 rondaId={rondaId}
   puedeConsultarRespuestas={respuestasV2Habilitadas(process.env)}/>
 </main>;
}
