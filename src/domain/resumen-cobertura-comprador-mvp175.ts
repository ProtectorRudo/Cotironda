/**
 * MVP175 — projection for the buyer's existing token-protected tracking page.
 *
 * The SQL envelope contains strictly private originals. It NEVER leaves the
 * Edge. This produces anonymous per-round aggregate counts only: NOT an offer
 * ranking, a technical certification, a source file or an award decision.
 */
import {diagnosticarRondaPrivadaMvp172} from './diagnostico-ronda-mvp172.ts';
import type {InsumoRondaPrivadoMvp172} from './diagnostico-ronda-mvp172.ts';

export type BuyerCoverageMvp175=Readonly<{
 state:'cobertura_revisada';
 quotations:number;
 requested_items:number;
 comparisons:number;
 commercial_alternatives:number;
 packaging_unproven:number;
 not_evaluated:number;
 explicit_differences:number;
 technical_uncertainty:number;
 ranking_allowed:false;
 price_comparable:false;
 contacts_revealed:false;
}>;

type TrackingStatus=Readonly<{
 state?:unknown;can_open?:unknown;
}>;
function isObject(v:unknown):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v);
}
const good=(n:number)=>Number.isSafeInteger(n)&&n>=0&&n<=360;

/** Omit, rather than show incomplete data, when sources differ or fail. */
export function resumirCoberturaCompradorMvp175(
 status:TrackingStatus|null,
 privateInput:unknown
):BuyerCoverageMvp175|null{
 if(!status||status.can_open!==true||
  !['waiting','closed'].includes(String(status.state))||
  !isObject(privateInput)||privateInput.state!=='private_inputs'||
  privateInput.rankingAllowed!==false||
  privateInput.contactsRevealed!==false)return null;

 let checked:ReturnType<typeof diagnosticarRondaPrivadaMvp172>;
 try{
  checked=diagnosticarRondaPrivadaMvp172(
   privateInput as unknown as InsumoRondaPrivadoMvp172
  );
 }catch{return null}
 if(checked.estado!=='diagnostico_privado'||
  checked.rankingHabilitado!==false||checked.adjudicacion!==false||
  checked.contactosRevelados!==false||checked.whatsappEnviado!==false||
  checked.originalesDescargables!==false)return null;

 const requested=checked.rondaResumen.articulosSolicitados;
 const quotes=checked.rondaResumen.cotizacionesAuditadas;
 const total=requested*quotes;
 if(!good(requested)||!good(quotes)||requested<1||quotes<1||
  !good(total)||checked.proveedoresAnonimos.length!==quotes)return null;

 let alternatives=0,unproven=0,unreviewed=0,
  differences=0,technical=0;
 for(const offer of checked.proveedoresAnonimos){
  if(offer.precioTotalComparable!==null||
   offer.articulos.length!==requested||offer.fiscalidad!=='sin_base_comparable'||
   offer.disponibilidad!=='no_acreditada')return null;
  for(const line of offer.articulos){
   switch(line.estado){
    case 'alternativa_comercial_con_aclaracion':
    case 'coincide_volumen_nominal_sin_stock':
     alternatives++;break;
    case 'presentacion_sin_acreditar':
    case 'sin_presentacion_corroborada':
     unproven++;break;
    case 'no_aplica':unreviewed++;break;
    case 'cantidad_diferente':
    case 'variedad_diferente':differences++;break;
    case 'presentacion_ambigua':
    case 'variedad_no_acreditada':technical++;break;
    default:return null;
   }
  }
 }
 const tally=alternatives+unproven+unreviewed+differences+technical;
 if(tally!==total||![alternatives,unproven,unreviewed,differences,technical].every(good))
  return null;
 return Object.freeze({
  state:'cobertura_revisada' as const,
  quotations:quotes,requested_items:requested,comparisons:total,
  commercial_alternatives:alternatives,
  packaging_unproven:unproven,
  not_evaluated:unreviewed,
  explicit_differences:differences,
  technical_uncertainty:technical,
  ranking_allowed:false as const,
  price_comparable:false as const,
  contacts_revealed:false as const
 });
}