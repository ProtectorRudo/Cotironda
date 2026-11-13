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
 const habilitado=respuestasV2Habilitadas(process.env);
 return <main className="panel">
  <span className="eyebrow">COTIRONDA · SEGUIMIENTO PRIVADO</span>
  <h1>{habilitado?'Presupuestos recibidos':'Ingreso seguro al piloto'}</h1>
  {habilitado?
   <p>Acá aparecen los negocios que respondieron a tu pedido, con sus
    documentos originales y análisis de referencia.</p>:
   <p>Verificá tu teléfono mediante SMS. Los presupuestos permanecen
    privados y todavía no están habilitados en esta prueba.</p>}
  <RespuestasCompradorV2 rondaId={rondaId}
   puedeConsultarRespuestas={habilitado}/>
 </main>;
}
