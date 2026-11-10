/**
 * MVP207 — public, buyer-only presentation contract for pilot originals.
 * The server is the security boundary; this module never grants access.
 * Never accept a WhatsApp tracking token or send credentials in a URL.
 */
export const PILOT_ORIGINALS_URL='https://ilggkalaafhtiysyzlmg.supabase.co';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const JWT=/^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/u;
const formats:Readonly<Record<string,string>>=Object.freeze({
 PDF:'pdf',Excel:'xlsx',Word:'docx',
 'Imagen JPEG':'jpg','Imagen PNG':'png',
 'Imagen WebP':'webp',CSV:'csv',Texto:'txt'
});
export type DocumentoPublicoMvp207=Readonly<{
 documentoId:string;nombre:string;formato:string;extension:string;
}>;
export type CatalogoPublicoMvp207=Readonly<{
 total:number;documentos:readonly DocumentoPublicoMvp207[];
 aviso:'Solo originales de proveedores que autorizaron compartirlos.';
}>;

const isObject=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);

export function telefonoOtpPilotoMvp207(raw:string):string|null{
 if(typeof raw!=='string')return null;
 const phone=raw.trim();
 return /^\+[1-9]\d{7,14}$/u.test(phone)?phone:null;
}
export function codigoOtpPilotoMvp207(code:string):string|null{
 return typeof code==='string'&&/^\d{6,8}$/u.test(code)?code:null;
}
export function proyeccionCatalogoPilotoMvp207(raw:unknown):CatalogoPublicoMvp207|null{
 if(!isObject(raw)||raw.estado!=='originales_consentidos'||
    raw.aviso!=='Solo originales de proveedores que autorizaron compartirlos.'||
    !Number.isSafeInteger(raw.total)||typeof raw.total!=='number'||
    raw.total<0||raw.total>100||
    !Array.isArray(raw.documentos)||raw.documentos.length!==raw.total)return null;
 const ids=new Set<string>(),documents:DocumentoPublicoMvp207[]=[];
 for(const d of raw.documentos){
  if(!isObject(d)||typeof d.documentoId!=='string'||
     !UUID.test(d.documentoId)||ids.has(d.documentoId)||
     typeof d.formato!=='string'||
     !Object.hasOwn(formats,d.formato)||
     typeof d.nombre!=='string'||
     d.nombre!=='Presupuesto original '+
      String(documents.length+1).padStart(2,'0'))return null;
  ids.add(d.documentoId);
  documents.push(Object.freeze({
   documentoId:d.documentoId,
   nombre:'Presupuesto original '+String(documents.length+1).padStart(2,'0'),
   formato:d.formato,extension:formats[d.formato]
  }));
 }
 return Object.freeze({
  total:documents.length,documentos:Object.freeze(documents),
  aviso:'Solo originales de proveedores que autorizaron compartirlos.' as const
 });
}

/** No external URL, query token, supplier ID or user-controlled path. */
export function rutaOriginalPilotoMvp207(
 rondaId:string,documentoId:string|null=null
):string|null{
 if(!UUID.test(rondaId)||documentoId!==null&&!UUID.test(documentoId))
  return null;
 return '/api/piloto/originales/'+rondaId+
  (documentoId===null?'':'/'+documentoId);
}

/** Browser requests are explicitly same-origin and uncacheable.
 * All Auth/session/consent checks are repeated by the server per request. */
export function opcionesOriginalesPilotoMvp207(token:string):RequestInit|null{
 if(typeof token!=='string'||token.length>8096||!JWT.test(token))
  return null;
 return {
  method:'GET',cache:'no-store',credentials:'omit',redirect:'error',
  mode:'same-origin',referrerPolicy:'no-referrer',
  headers:{Authorization:'Bearer '+token}
 };
}
