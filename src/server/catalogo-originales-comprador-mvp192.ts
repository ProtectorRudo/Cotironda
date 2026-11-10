/**
 * MVP192 — presentation-safe projection of the *service-only* SQL response.
 * Called after a verified PILOT Auth session, never with the WhatsApp tracking
 * token. No supplier identity, source SHA, HMAC, storage location or price.
 */
export type OriginalListableMvp192=Readonly<{
 documentoId:string;nombre:string;formato:string;
}>;
export type CatalogoOriginalesMvp192=Readonly<{
 estado:'originales_consentidos';total:number;
 documentos:readonly OriginalListableMvp192[];
 aviso:'Solo originales de proveedores que autorizaron compartirlos.';
}>;

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/iu;
const FORMATS:Readonly<Record<string,string>>=Object.freeze({
 'application/pdf':'PDF',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'Excel',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'Word',
 'image/jpeg':'Imagen JPEG','image/png':'Imagen PNG',
 'image/webp':'Imagen WebP','text/csv':'CSV','text/plain':'Texto'
});
function object(x:unknown):x is Record<string,unknown>{
 return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
export function proyectarCatalogoOriginalesMvp192(raw:unknown):
 CatalogoOriginalesMvp192|null{
 if(!object(raw)||raw.state!=='authorized_catalog'||
    !Array.isArray(raw.originals)||
    typeof raw.total!=='number'||!Number.isSafeInteger(raw.total)||
    raw.total!==raw.originals.length||
    raw.total<0||raw.total>100)return null;
 const used=new Set<string>();
 const documents:OriginalListableMvp192[]=[];
 for(const entry of raw.originals){
  if(!object(entry)||typeof entry.documentId!=='string'||
    !UUID.test(entry.documentId)||used.has(entry.documentId)||
    typeof entry.mime!=='string'||!Object.hasOwn(FORMATS,entry.mime)||
    (entry.kind!=='document'&&entry.kind!=='image'))return null;
  used.add(entry.documentId);
  documents.push(Object.freeze({
   documentoId:entry.documentId,
   nombre:'Presupuesto original '+(documents.length+1).toString().padStart(2,'0'),
   formato:FORMATS[entry.mime]
  }));
 }
 return Object.freeze({
  estado:'originales_consentidos' as const,total:documents.length,
  documentos:Object.freeze(documents),
  aviso:'Solo originales de proveedores que autorizaron compartirlos.' as const
 });
}
