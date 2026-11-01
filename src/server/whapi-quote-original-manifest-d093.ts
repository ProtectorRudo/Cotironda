/**
 * D093 trusted broker's manifest for the WHOLE supplier text.
 * This is prepared after successful D028 AES-GCM verification; the source
 * itself stays encrypted in D028 and is never written as free text in SQL.
 */
import {createHash} from 'node:crypto';
import {capturarPresupuestoOriginalMvp063}
 from '../domain/presupuesto-original-fiel-mvp063.ts';

export type ManifiestoOriginalD093=Readonly<{
 source_text_sha256:string;
 source_bytes:number;
 source_lines:number;
 total_status:'explicitamente_verificado'|'no_detectado'|'ambiguo_no_verificado';
 total_source:Readonly<{line_no:number;literal_sha256:string}>|null;
}>;
function fail():never{throw Error('d093_manifiesto_original_invalido')}
export function prepararManifiestoOriginalD093(texto:string):ManifiestoOriginalD093{
 let mirror:ReturnType<typeof capturarPresupuestoOriginalMvp063>;
 try{mirror=capturarPresupuestoOriginalMvp063(texto)}catch{fail()}
 const size=Buffer.byteLength(texto,'utf8'),lines=mirror.renglones.length;
 if(size<1||size>8192||lines<1||lines>160)fail();
 const total=mirror.totalDeclarado;
 return Object.freeze({
  source_text_sha256:mirror.sha256,
  source_bytes:size,
  source_lines:lines,
  total_status:mirror.estadoTotal,
  total_source:total===null?null:Object.freeze({
   line_no:total.numeroLinea,
   literal_sha256:createHash('sha256')
    .update(total.importeLiteral,'utf8').digest('hex')
  })
 });
}
