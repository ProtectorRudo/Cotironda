/**
 * MVP-078b: puente entre una revision PRIVADA ya leida por un servidor
 * autorizado y el desglose fiel MVP-078. No ejecuta SQL ni abre un endpoint.
 * El texto fuente permanece dentro de esta funcion; la salida es una
 * lista blanca SIN texto, importes, identidad, telefono o hash.
 */
import {createHash} from 'node:crypto';
import {vincularRenglonesOriginalesMvp078,
 type CorrelacionRenglonMvp078} from './ledger-fuente-cotizacion-mvp078.ts';

export type RevisionPrivadaMvp078b = Readonly<{
 solicitudId:string;
 proveedorRef:string;
 revision:number;
 textoOriginal:string;
}>;
export type ResumenPrivadoMvp078b = Readonly<{
 estado:'solo_diagnostico_privado';
 revision:number;
 renglonesTotales:number;
 renglonesVinculados:number;
 materialesSolicitadosConImporteVerificable:number;
 materialesSolicitadosConImporteAmbiguo:number;
 renglonesMonetariosNoClasificados:number;
 totalDeclarado:'verificado'|'ambiguo'|'ausente';
 conciliacion:'coincide'|'diferencia'|'no_verificable';
 iva:'incluido'|'excluido'|'desconocido'|'contradictorio';
 flete:'importe'|'incluido'|'pendiente'|'desconocido'|'contradictorio';
 rankingHabilitado:false;
 contactosRevelados:false;
 mensajesEnviados:0;
}>;
const KEY=/^[a-z][a-z0-9_]{2,63}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
function validKeys(v:unknown,keys:readonly string[]):boolean{
 return !!v&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
}
function fail():never{throw new TypeError('mvp078b_revision_privada_invalida')}

/** Requiere una revision autenticada del backend, no entrada WhatsApp directa. */
export function resumirRevisionPrivadaMvp078b(
 fuente:RevisionPrivadaMvp078b,
 identidadEsperada:Readonly<{solicitudId:string;proveedorRef:string;revision:number}>,
 correlaciones:readonly CorrelacionRenglonMvp078[]
):ResumenPrivadoMvp078b{
 if(!validKeys(fuente,['solicitudId','proveedorRef','revision','textoOriginal'])||
  !validKeys(identidadEsperada,['solicitudId','proveedorRef','revision'])||
  typeof fuente.solicitudId!=='string'||!UUID.test(fuente.solicitudId)||
  typeof fuente.proveedorRef!=='string'||!KEY.test(fuente.proveedorRef)||
  fuente.solicitudId!==identidadEsperada.solicitudId||
  fuente.proveedorRef!==identidadEsperada.proveedorRef||
  fuente.revision!==identidadEsperada.revision||
  !Number.isSafeInteger(fuente.revision)||fuente.revision<1||fuente.revision>100||
  typeof fuente.textoOriginal!=='string'||!Array.isArray(correlaciones))fail();
 const digest=createHash('sha256').update(fuente.textoOriginal,'utf8').digest('hex');
 const ledger=vincularRenglonesOriginalesMvp078({
  textoOriginal:fuente.textoOriginal,fuenteSha256:digest,
  revision:fuente.revision,correlaciones
 });
 // El SHA se calcula localmente para comprobar la fidelidad del desglose.
 // No existe aun SHA independiente persistido en la tabla de versiones.
 // Los importes NO constituyen evidencia de comparabilidad economica.
 const total=ledger.estadoTotal==='explicitamente_verificado'?'verificado':
  ledger.estadoTotal==='ambiguo_no_verificado'?'ambiguo':'ausente';
 const conc=ledger.estadoConciliacion==='cuadra_suma_observada'?'coincide':
  ledger.estadoConciliacion==='diferencia_detectada'?'diferencia':'no_verificable';
 const iva=ledger.estadoIva==='incluido_explicito'?'incluido':
  ledger.estadoIva==='excluido_explicito'?'excluido':
  ledger.estadoIva==='contradictorio'?'contradictorio':'desconocido';
 const flete=ledger.estadoFlete==='monto_explicito'?'importe':
  ledger.estadoFlete==='incluido_explicito'?'incluido':
  ledger.estadoFlete==='a_convenir'?'pendiente':
  ledger.estadoFlete==='contradictorio'?'contradictorio':'desconocido';
 return Object.freeze({
  estado:'solo_diagnostico_privado',revision:ledger.revision,
  renglonesTotales:ledger.lineas.length,
  renglonesVinculados:ledger.lineas.filter(l=>l.destino!=='sin_clasificar').length,
  materialesSolicitadosConImporteVerificable:ledger.lineasSolicitadasConImportesVerificados,
  materialesSolicitadosConImporteAmbiguo:ledger.lineasSolicitadasSinImporteVerificado,
  renglonesMonetariosNoClasificados:ledger.lineasSinClasificarConImportes,
  totalDeclarado:total,conciliacion:conc,iva,flete,
  rankingHabilitado:false,contactosRevelados:false,mensajesEnviados:0
 });
}
