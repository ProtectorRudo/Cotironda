/**
 * MVP161. Fail-closed eligibility gate, SERVER-ONLY intended.
 * Does not sign URLs or expose documents. All fields from trusted DB queries.
 * Ranking/recommendations never determine who can download originals.
 */
export type AccesoOriginal=Readonly<{
 ahoraMs:number; politicaDesdeMs:number|null;
 ronda:Readonly<{id:string;compradorId:string;empresaId:string;
 estado:'prepared'|'closed'|'cancelled';creadaMs:number;venceMs:number;cerradaMs:number|null}>;
 sesion:Readonly<{autenticada:boolean;rol:'buyer'|'supplier'|'admin';
 usuarioId:string;empresaId:string;venceMs:number;revocadaMs:number|null}>;
 invitacion:Readonly<{rondaId:string;proveedorId:string;enviadaMs:number}>;
 consentimiento:Readonly<{rondaId:string;proveedorId:string;
 alcance:'original_identificable_tras_cierre';version:string;
 aceptadoMs:number;revocadoMs:number|null}>|null;
 archivo:Readonly<{rondaId:string;proveedorId:string;mensajeHmac:string;
 bucket:string;ruta:string;mime:string;bytes:number;sha256:string;
 recibidoMs:number;vigente:boolean;almacenado:boolean}>;
 prueba:Readonly<{rondaId:string;proveedorId:string;
 sha256:string;verificada:boolean;revisionVigente:boolean}>;
}>;
export type ResultadoAcceso=Readonly<{
 permitido:boolean;
 motivo:'autorizado'|'invalido'|'comprador_no_autorizado'|'ronda_abierta'
 |'politica_no_aplicable'|'sin_consentimiento'|'fuente_no_verificada';
}>;
const time=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
const hash=(s:unknown):s is string=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const uid=(s:unknown):s is string=>typeof s==='string'&&/^[a-z0-9_-]{3,100}$/.test(s);
const uuid=(s:unknown):s is string=>typeof s==='string'&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s);
const MIMES=new Set(['application/pdf','image/jpeg','image/png','image/webp',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','text/csv']);
const out=(motivo:ResultadoAcceso['motivo']):ResultadoAcceso=>
 Object.freeze({permitido:motivo==='autorizado',motivo});

/** Internal reason NEVER returned by public API: respond with a uniform
 * unauthorized/not-found error. No caller input may set authenticated flags.
 * Signed download URL creation is intentionally not implemented here. */
export function evaluarDescargaOriginalMvp161(d:AccesoOriginal):ResultadoAcceso{
 if(!d||!time(d.ahoraMs)||!d.ronda||!d.sesion||!d.invitacion||!d.archivo||!d.prueba)
  return out('invalido');
 const {ronda:r,sesion:s,invitacion:i,consentimiento:c,archivo:a,prueba:p}=d;
 if(!uuid(r.id)||!uid(r.empresaId)||!uid(r.compradorId)||
   !uid(s.empresaId)||!uid(s.usuarioId)||!uid(i.proveedorId)||
   !uid(a.proveedorId)||!uid(p.proveedorId)||
   !time(r.creadaMs)||!time(r.venceMs)||!time(i.enviadaMs)||!time(a.recibidoMs))
  return out('invalido');
 if(s.autenticada!==true||s.rol!=='buyer'||s.empresaId!==r.empresaId||
   s.usuarioId!==r.compradorId||!time(s.venceMs)||s.venceMs<=d.ahoraMs||
   s.revocadaMs!==null)
  return out('comprador_no_autorizado');
 if(r.estado!=='closed'||!time(r.cerradaMs)||r.cerradaMs<r.venceMs||
   d.ahoraMs<r.cerradaMs||d.ahoraMs<r.venceMs)
  return out('ronda_abierta');
 if(!time(d.politicaDesdeMs)||r.creadaMs<d.politicaDesdeMs)
  return out('politica_no_aplicable');
 // Two STRICT forms of explicit supplier approval:
 // Legacy: one verified message after creating THIS round.
 // MVP362: once at onboarding, versioned + verified by the SQL evidence
 // gate, strictly BEFORE creating the round. General participation is NOT
 // original disclosure consent; the server cannot fabricate this record.
 const legacy=c?.version==='cotironda-originales-v1' &&
   time(c?.aceptadoMs)&&c.aceptadoMs>=r.creadaMs;
 const onboarding=c?.version==='cotironda-originales-alta-v1' &&
   time(c?.aceptadoMs)&&c.aceptadoMs<r.creadaMs;
 if(!c||c.alcance!=='original_identificable_tras_cierre'||
   (!legacy&&!onboarding)||c.rondaId!==r.id||
   c.proveedorId!==a.proveedorId||
   !time(c.aceptadoMs)||c.aceptadoMs<d.politicaDesdeMs!||
   c.aceptadoMs>i.enviadaMs||c.revocadoMs!==null)
  return out('sin_consentimiento');
 if(i.rondaId!==r.id||i.proveedorId!==a.proveedorId||
   i.enviadaMs<r.creadaMs||i.enviadaMs>a.recibidoMs||a.recibidoMs>r.venceMs||
   a.rondaId!==r.id||p.rondaId!==r.id||p.proveedorId!==a.proveedorId||
   a.almacenado!==true||a.vigente!==true||p.verificada!==true||
   p.revisionVigente!==true||a.bucket!=='cotironda-piloto-originals'||
   !hash(a.mensajeHmac)||a.ruta!==('media/'+a.mensajeHmac)||
   !hash(a.sha256)||!hash(p.sha256)||a.sha256!==p.sha256||
   !MIMES.has(a.mime)||!Number.isSafeInteger(a.bytes)||
   a.bytes<1||a.bytes>8388608)
  return out('fuente_no_verificada');
 return out('autorizado');
}
