/** Cotironda V2: el archivo descargado conserva los bytes y el tipo real
 * declarado por el backend privado, no la etiqueta genérica "Word"/"Excel".
 * Sin nombres de archivo provenientes del proveedor ni rutas arbitrarias.
 */
const EXTENSION_POR_MIME:Readonly<Record<string,string>>=Object.freeze({
 'application/pdf':'pdf',
 'application/vnd.ms-excel':'xls',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx',
 'application/msword':'doc',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx',
 'image/jpeg':'jpg',
 'image/png':'png',
 'image/webp':'webp',
 'text/csv':'csv',
 'text/plain':'txt'
});
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;

/** Sólo la respuesta autorizada entrega el MIME. Una extensión desconocida
 * queda como .bin en lugar de afirmar que es un XLSX o DOCX.
 */
export function nombreDescargaOriginalV2(
 documentoId:string,mimeHeader:string|null
):string{
 const id=typeof documentoId==='string'&&UUID.test(documentoId)?
  documentoId.slice(0,8).toLowerCase():'desconocido';
 const mime=typeof mimeHeader==='string'?
  mimeHeader.split(';',1)[0].trim().toLowerCase():'';
 const extension=Object.hasOwn(EXTENSION_POR_MIME,mime)?
  EXTENSION_POR_MIME[mime]:'bin';
 return 'cotironda-original-'+id+'.'+extension;
}
