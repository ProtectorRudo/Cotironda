import type {SupabaseClient} from '@supabase/supabase-js';
import {prepararBorrador,rutaBorrador,BUCKET_BORRADORES} from '../../../../src/domain/borradores-storage.ts';

// No crear URLs públicas, ni service_role, ni subir con upsert.
// El caller debe tener una sesión legítima; la autorización final la decide RLS.
export async function subirBorrador(
 client:SupabaseClient,
 params:Parameters<typeof prepararBorrador>[0]
){
 const checked=await prepararBorrador(params);
 const {data,error}=await client.storage.from(checked.bucket).upload(
  checked.path,checked.file,
  {contentType:checked.mime,upsert:false,cacheControl:'0'}
 );
 if(error)throw new Error('carga_rechazada');
 return {path:data?.path||checked.path};
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
