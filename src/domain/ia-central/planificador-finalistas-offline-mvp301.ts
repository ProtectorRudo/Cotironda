/**
 * MVP301 — PROPUESTAS de cobertura tras cierre, 100 % OFFLINE.
 * Reutiliza la verificacion de fuente y aritmetica MVP225; no crea ni
 * habilita finalistas en DB, no envia WhatsApps ni libera contactos.
 *
 * ADVERTENCIA: cierreComprobado es un dato del simulador, NO una prueba
 * de autorización. El caller de producción necesitará una RPC privada
 * que vuelva a verificar ronda cerrada, revision de fuente vigente,
 * consentimiento y elección MANUAL antes de crear cualquier plan.
 */
import {compararPorRubroMvp225,
 type PedidoLineaMvp225,type OfertaVerificadaMvp225}
 from './calificador-cotizaciones-mvp225.ts';
import {gruposCoberturaMvp254} from './opciones-cobertura-rubros-mvp254.ts';

type Propuesta=Readonly<{
 modo:'individual'|'complementaria';
 ofertasAnonimas:readonly string[];
 articulosCubiertos:number;
 articulosSolicitados:number;
 condicionesHomogeneas:boolean;
 rubros:readonly string[];
}>;
export type PlanOfflineMvp301=Readonly<{
 estado:'fuentes_invalidas'|'cierre_no_acreditado'|
  'sin_ofertas_verificadas'|'sin_cobertura_completa'|
  'opciones_para_decision_manual';
 propuestas:readonly Propuesta[];
 ofertasVerificadas:number;
 ofertasEnRevision:number;
 rankingGlobalPermitido:false;
 ganadorElegido:false;
 adjudicacionAutomatica:false;
 aprobacionManualRequerida:true;
 contactosRevelados:false;
 mensajesEnviados:false;
 produccionModificada:false;
}>;

const label=/^(?:Presupuesto [1-9][0-9]{0,2}|Oferta [A-Z0-9]{1,3})$/u;
const item=/^[a-zA-Z0-9_-]{2,80}$/u;
const frozen=<T>(v:readonly T[]):readonly T[]=>Object.freeze([...v]);
const result=(estado:PlanOfflineMvp301['estado'],
 propuestas:readonly Propuesta[]=[],verificadas=0,revision=0):
 PlanOfflineMvp301=>Object.freeze({
 estado,propuestas:frozen(propuestas),ofertasVerificadas:verificadas,
 ofertasEnRevision:revision,rankingGlobalPermitido:false as const,
 ganadorElegido:false as const,adjudicacionAutomatica:false as const,
 aprobacionManualRequerida:true as const,contactosRevelados:false as const,
 mensajesEnviados:false as const,produccionModificada:false as const
});
const iguales=(a:OfertaVerificadaMvp225,b:OfertaVerificadaMvp225)=>
 a.moneda===b.moneda&&a.iva===b.iva&&a.flete===b.flete&&a.pago===b.pago;

/** Solo opciones de 1 o 2 proveedores que cubran TODOS los articulos
 * con precios por renglon cotejados. Una oferta con incertidumbre
 * permanece en revision y no se transforma en candidato.
 */
export function proponerCoberturaFinalMvp301(args:Readonly<{
 cierreComprobado:boolean;
 pedido:readonly PedidoLineaMvp225[];
 presupuestos:readonly OfertaVerificadaMvp225[];
}>):PlanOfflineMvp301{
 try{
  if(!args||!Array.isArray(args.pedido)||args.pedido.length<1||
     args.pedido.length>25||!Array.isArray(args.presupuestos)||
     args.presupuestos.length>12||
     new Set(args.pedido.map(x=>x?.id)).size!==args.pedido.length||
     args.pedido.some(x=>!x||typeof x.id!=='string'||!item.test(x.id))||
     args.presupuestos.some(x=>!x||!label.test(x.etiquetaAnonima))||
     new Set(args.presupuestos.map(x=>x.etiquetaAnonima)).size!==
      args.presupuestos.length)
   return result('fuentes_invalidas');
  if(args.cierreComprobado!==true)return result('cierre_no_acreditado');
  // El comparador ya exige literal de importe, cantidad, unidad,
  // reconciliacion exacta, fuente y condiciones comerciales.
  const scan=compararPorRubroMvp225(args.pedido,args.presupuestos);
  const good:{index:number;ids:string[]}[]=[];
  let revision=0;
  for(let i=0;i<scan.ofertas.length;i++){
   const candidate=scan.ofertas[i];
   if(candidate.estado!=='verificada_para_comparacion'){
    revision++;continue;
   }
   // NUNCA usar rubros.respondidos para inferir valor comparable.
   // Una alternativa 25kg/50kg puede ser cobertura comercial,
   // pero no convierte automaticamente un importe en elegible.
   const ids=candidate.precios.map(x=>x.pedidoId);
   if(new Set(ids).size!==ids.length||
      ids.some(id=>!args.pedido.some(x=>x.id===id)))
    return result('fuentes_invalidas');
   if(ids.length>0)good.push({index:i,ids});
  }
  if(good.length===0)
   return result('sin_ofertas_verificadas',[],0,revision);
  const options:Propuesta[]=[];
  const asked=new Set(args.pedido.map(x=>x.id));
  const rubroOrden=[...new Set(args.pedido.map(x=>x.rubro))];
  for(const positions of gruposCoberturaMvp254(good.map(x=>x.ids))){
   // No proponer dos proveedores cuando uno cubre todo solo:
   // la segunda cotizacion no incrementa cobertura de esa pareja.
   if(positions.length===2&&positions.some(i=>good[i].ids.length===asked.size))
    continue;
   const combined=new Set(positions.flatMap(i=>good[i].ids));
   if(combined.size!==asked.size||
      [...asked].some(id=>!combined.has(id)))continue;
   const indices=positions.map(i=>good[i].index);
   const offers=indices.map(i=>args.presupuestos[i]);
   const labels=offers.map(x=>x.etiquetaAnonima);
   options.push(Object.freeze({
    modo:positions.length===1?'individual' as const:'complementaria' as const,
    ofertasAnonimas:frozen(labels),
    articulosCubiertos:combined.size,articulosSolicitados:asked.size,
    condicionesHomogeneas:offers.length===1||iguales(offers[0],offers[1]),
    rubros:frozen(rubroOrden)
   }));
  }
  if(options.length===0)
   return result('sin_cobertura_completa',[],good.length,revision);
  // Orden solo por numero de proveedores y etiquetas anonimas, NUNCA
  // por sumatoria parcial, descuento, importe o llegada al webhook.
  options.sort((a,b)=>a.ofertasAnonimas.length-b.ofertasAnonimas.length||
   a.ofertasAnonimas.join('|').localeCompare(b.ofertasAnonimas.join('|')));
  return result('opciones_para_decision_manual',options,good.length,revision);
 }catch{return result('fuentes_invalidas')}
}
