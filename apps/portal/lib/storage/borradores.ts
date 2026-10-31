import type {SupabaseClient} from '@supabase/supabase-js';
import {prepararBorrador,rutaBorrador,BUCKET_BORRADORES} from '../../../../src/domain/borradores-storage.ts';

// CONTENCIÓN: no habilitar envíos directos hasta contar con validación
// antimalware y cuarentena del servidor. RLS también los rechaza.
// Sólo un pipeline de ingestión autorizado podrá cargar posteriormente.
export async function subirBorrador(
 client:SupabaseClient,
 params:Parameters<typeof prepararBorrador>[0]
){
 void client;
 void params;
 throw new Error('carga_pendiente_revision_servidor');
}
export async function descargarBorrador(
 client:SupabaseClient,
 params:{organizationId:string;requestId:string;fileId:string;extension:string}
){
 const path=rutaBorrador(params.organizationId,params.requestId,params.fileId,params.extension);
 const {data,error}=await client.storage.from(BUCKET_BORRADORES).download(path);
 if(error||!data)throw new Error('descarga_denegada');
 return data;
}
