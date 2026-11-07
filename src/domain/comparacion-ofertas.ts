import {elegirParExacto25,type PrecioPar} from './comparacion-pares-exacta.ts';

/**
 * Cotironda / Etapa 03 - Comparador económico OFFLINE y conservador.
 * Solo acepta datos previamente verificados y ofertas confirmadas.
 * Nunca adjudica, no conoce identidades/contactos y no ejecuta red.
 * Restricción explícita: asignación completa de cada renglón a UN proveedor.
 */
export type UnidadCotizada = 'unit'|'bag'|'box'|'kg'|'g'|'l'|'ml'|'m'|'m2'|'m3'|'roll'|'pack';
export type MonedaCotizada = 'ARS'|'USD';
export type FormaPago = 'contado'|'transferencia'|'cuenta_corriente_30_dias';
export type IvaExplicito = '0'|'10.5'|'21';
export type PedidoComparable = Readonly<{
  items:readonly Readonly<{id:string;cantidad:string;unidad:UnidadCotizada}>[];
}>;
export type LineaOfertaConfirmada = Readonly<{
  itemId:string;unidad:UnidadCotizada;cantidadDisponible:string;
  equivalencia:'verificada'|'comercial_razonable'|'sin_verificar'|'incompatible';
  precioUnitarioNeto:string|null;ivaPorcentaje:IvaExplicito|null;
}>;
export type OfertaComparable = Readonly<{
  anonId:string;version:number;confirmada:boolean;moneda:MonedaCotizada;
  formaPago:FormaPago|null;plazoEntregaDias:number|null;
  fleteFinal:string|null;minimoCompraFinal:string|null;
  items:readonly LineaOfertaConfirmada[];
}>;
export type CoberturaProveedor = Readonly<{
  anonId:string;confirmada:boolean;lineasCompletas:number;lineasTotales:number;
  lineas:readonly Readonly<{
    itemId:string;unidad:UnidadCotizada;solicitada:string;cotizable:string;
    completa:boolean;motivo:string|null;advertencia?:'alternativa_comercial_con_aclaracion'
  }>[];
  totalComparable:string|null;motivos:readonly string[];
}>;
export type OpcionComparacion = Readonly<{
  proveedoresAnonimos:readonly string[];asignacion:readonly Readonly<{itemId:string;anonId:string}>[];
  moneda:MonedaCotizada;formaPago:FormaPago;plazoEntregaDias:number;
  totalFinal:string;materialesConIva:string;fletesFinal:string;
  puestoDentroDeCondiciones:number|null;grupoCondiciones:string;
  /** Alternative material is commercially plausible, NOT identical. */
  advertencias?:readonly Readonly<{itemId:string;tipo:'alternativa_comercial_con_aclaracion'}>[];
}>;
export type ResultadoComparacion = Readonly<{
  estado:'comparacion_offline_sin_adjudicacion';
  cobertura:readonly CoberturaProveedor[];
  opcionesCompletas:readonly OpcionComparacion[];
  gruposComparables:number;
  limite:'solo_asignacion_de_lineas_completas_sin_fraccionar';
  optimoGlobalGarantizado:false;
  /** Full pair search or fail-closed on expensive cases; never partial rankings. */
  comparacionPares:'exhaustiva'|'suspendida_por_complejidad';
  paresCalculados:number;
  contactoRevelado:false;adjudicacionAutomatica:false;
}>;
type Item = {id:string;unidad:UnidadCotizada;q:bigint;cantidad:string};
type Line = {id:string;unidad:UnidadCotizada;disponible:bigint;equivalencia:LineaOfertaConfirmada['equivalencia'];neto:bigint|null;iva:bigint|null};
type Q = {src:OfertaComparable;lines:Map<string,Line>;flete:bigint|null;minimo:bigint|null};
type Candidate={ids:string[];assignment:string[];currency:MonedaCotizada;pay:FormaPago;days:number;total:bigint;materials:bigint;freight:bigint;group:string};

const UNIDADES=new Set<UnidadCotizada>(['unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack']);
const PAGO=new Set<FormaPago>(['contado','transferencia','cuenta_corriente_30_dias']);
const IVA:{[K in IvaExplicito]:bigint}={'0':0n,'10.5':1050n,'21':2100n};
const MAX_ITEMS=100,MAX_OFERTAS=200,MAX_AMOUNT=1000000000000n; // 10.000 millones ARS (centavos).
// Deterministic CPU ceiling, not a list truncation. At this limit the engine
// still shows every offer's coverage and comparable individual total, but it
// suspends ALL pair rankings instead of presenting a deceptive partial search.
const PAIR_WORK_BUDGET=500000;
function error():never{throw new TypeError('comparacion_entrada_invalida');}
function record(x:unknown):x is Record<string,unknown>{
  return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function exactKeys(x:unknown,keys:readonly string[]):void{
  if(!record(x)||Object.keys(x).length!==keys.length||
    Object.keys(x).some(k=>!keys.includes(k)))error();
}
function id(x:unknown):x is string{return typeof x==='string'&&/^[a-z][a-z0-9_]{2,49}$/.test(x)}
function dec(v:unknown,scale:2|3):bigint{
  if(typeof v!=='string'||!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/.test(v))error();
  const [int,fr='']=v.split('.');
  if(fr.length>scale)error();
  const n=BigInt(int)*10n**BigInt(scale)+BigInt(fr.padEnd(scale,'0')||'0');
  if(n>MAX_AMOUNT*(scale===2?1n:10n))error();
  return n;
}
function money(v:bigint):string{
  const sign=v<0n?'-':'',a=v<0n?-v:v;
  return sign+(a/100n).toString()+'.'+(a%100n).toString().padStart(2,'0');
}
function qty(v:bigint):string{
  return (v/1000n).toString()+(v%1000n===0n?'':'.'+(v%1000n).toString().padStart(3,'0').replace(/0+$/,''));
}
function roundDiv(n:bigint,d:bigint):bigint{return (n+d/2n)/d}
function validLine(q:Q,item:Item):Line|null{
  const v=q.lines.get(item.id);
  return v&&['verificada','comercial_razonable'].includes(v.equivalencia)&&v.unidad===item.unidad?v:null;
}
function linePrice(v:Line,quantity:bigint):bigint|null{
  if(v.neto===null||v.iva===null)return null;
  // Redondeo comercial HALF UP: base por renglón a centavo, IVA por renglón a centavo.
  const base=roundDiv(v.neto*quantity,1000n);
  return base+roundDiv(base*v.iva,10000n);
}
function buildOffer(raw:OfertaComparable,items:Item[],ids:Set<string>):Q{
  exactKeys(raw,['anonId','version','confirmada','moneda','formaPago','plazoEntregaDias','fleteFinal','minimoCompraFinal','items']);
  if(!id(raw.anonId)||!raw.anonId.startsWith('anon_')||ids.has(raw.anonId)||
    !Number.isSafeInteger(raw.version)||raw.version<1||typeof raw.confirmada!=='boolean'||
    (raw.moneda!=='ARS'&&raw.moneda!=='USD')||
    !(raw.formaPago===null||PAGO.has(raw.formaPago))||
    !(raw.plazoEntregaDias===null||Number.isSafeInteger(raw.plazoEntregaDias)&&
      raw.plazoEntregaDias>=0&&raw.plazoEntregaDias<=120)||
    !Array.isArray(raw.items)||raw.items.length>MAX_ITEMS)error();
  ids.add(raw.anonId);
  const known=new Set(items.map(x=>x.id));
  const seen=new Set<string>(),lines=new Map<string,Line>();
  for(const v of raw.items){
    exactKeys(v,['itemId','unidad','cantidadDisponible','equivalencia','precioUnitarioNeto','ivaPorcentaje']);
    if(!id(v.itemId)||!known.has(v.itemId)||seen.has(v.itemId)||
      !UNIDADES.has(v.unidad)||
      !['verificada','comercial_razonable','sin_verificar','incompatible'].includes(v.equivalencia)||
      !(v.ivaPorcentaje===null||Object.hasOwn(IVA,v.ivaPorcentaje)))error();
    seen.add(v.itemId);
    const q=dec(v.cantidadDisponible,3);
    const neto=v.precioUnitarioNeto===null?null:dec(v.precioUnitarioNeto,2);
    lines.set(v.itemId,{id:v.itemId,unidad:v.unidad,disponible:q,
      equivalencia:v.equivalencia,neto,iva:v.ivaPorcentaje===null?null:IVA[v.ivaPorcentaje as IvaExplicito]});
  }
  return {src:raw,lines,flete:raw.fleteFinal===null?null:dec(raw.fleteFinal,2),
    minimo:raw.minimoCompraFinal===null?null:dec(raw.minimoCompraFinal,2)};
}
function candidate(items:Item[],qs:Q[],assignment:number[]):Candidate|null{
  const involved=new Set(assignment);
  if(!involved.size)return null;
  const first=qs[assignment[0]].src;
  if(!first.confirmada||first.formaPago===null||first.plazoEntregaDias===null)return null;
  for(const index of involved){
    const r=qs[index].src;
    if(!r.confirmada||r.moneda!==first.moneda||
      r.formaPago!==first.formaPago||r.plazoEntregaDias!==first.plazoEntregaDias||
      qs[index].flete===null||qs[index].minimo===null)return null;
  }
  const subtotals=new Map<number,bigint>();
  for(let i=0;i<items.length;i++){
    const index=assignment[i],line=validLine(qs[index],items[i]);
    if(!line||line.disponible<items[i].q)return null;
    const price=linePrice(line,items[i].q);
    if(price===null)return null;
    subtotals.set(index,(subtotals.get(index)??0n)+price);
  }
  let materials=0n,freight=0n;
  for(const index of involved){
    const sub=subtotals.get(index)??0n;
    if(sub<(qs[index].minimo as bigint))return null;
    materials+=sub; freight+=qs[index].flete as bigint;
  }
  return {ids:[...involved].map(i=>qs[i].src.anonId).sort(),
    assignment:assignment.map(i=>qs[i].src.anonId),
    currency:first.moneda,pay:first.formaPago,days:first.plazoEntregaDias,
    total:materials+freight,materials,freight,
    group:[first.moneda,first.formaPago,String(first.plazoEntregaDias)].join('|')};
}
/** Reject obviously incomparable pairs before any expensive allocation.
 * Up to 100 requested lines: 25 is the MAXIMUM number of lines flexible
 * between both providers, not a limit on the size of the buyer's request. */
function pairInputs(items:Item[],qs:Q[],a:number,b:number):
 {prices:readonly PrecioPar[];work:number|null}|null {
 if(items.length<2)return null;
 const left=qs[a],right=qs[b],x=left.src,y=right.src;
 if(!x.confirmada||!y.confirmada||
   x.moneda!==y.moneda||x.formaPago===null||
   x.formaPago!==y.formaPago||x.plazoEntregaDias===null||
   x.plazoEntregaDias!==y.plazoEntregaDias||
   left.flete===null||right.flete===null||
   left.minimo===null||right.minimo===null)return null;
 const prices:PrecioPar[]=items.map(item=>{
  const la=validLine(left,item),lb=validLine(right,item);
  const pa=la&&la.disponible>=item.q?linePrice(la,item.q):null;
  const pb=lb&&lb.disponible>=item.q?linePrice(lb,item.q):null;
  return {a:pa,b:pb};
 });
 // A missing article is never filled from a third supplier or price 0.
 if(prices.some(p=>p.a===null&&p.b===null))return null;
 const flex=prices.filter(p=>p.a!==null&&p.b!==null).length;
 // Include linear output cost as well: 200 suppliers × 100 lines with
 // forced pair allocations would otherwise generate millions of results.
 return {prices,work:flex>25?null:2**Math.ceil(flex/2)+items.length*5};
}
/** Exact allocation for a pair with at most 25 FLEXIBLE lines; other
 * requested lines may be forced to one provider. No price approximation. */
function exactPair(items:Item[],qs:Q[],a:number,b:number,
 prices:readonly PrecioPar[]):Candidate|null {
 const assignment=elegirParExacto25({precios:prices,
  minimoA:qs[a].minimo as bigint,minimoB:qs[b].minimo as bigint,
  preferirA:qs[a].src.anonId<qs[b].src.anonId});
 return assignment===null?null:candidate(items,qs,assignment.map(useA=>useA?a:b));
}

export function compararCotizacionesOffline(pedido:PedidoComparable,
  ofertas:readonly OfertaComparable[]):ResultadoComparacion {
  exactKeys(pedido,['items']);
  if(!Array.isArray(pedido.items)||pedido.items.length===0||
    pedido.items.length>MAX_ITEMS||!Array.isArray(ofertas)||ofertas.length>MAX_OFERTAS)error();
  const itemIds=new Set<string>();
  const items:Item[]=pedido.items.map(x=>{
    exactKeys(x,['id','cantidad','unidad']);
    if(!id(x.id)||itemIds.has(x.id)||!UNIDADES.has(x.unidad))error();
    itemIds.add(x.id);
    const q=dec(x.cantidad,3);if(q===0n)error();
    return {id:x.id,unidad:x.unidad,q,cantidad:x.cantidad};
  });
  const anonymousIds=new Set<string>();
  const qs=ofertas.map(o=>buildOffer(o,items,anonymousIds));
  const coverage:CoberturaProveedor[]=qs.map(q=>{
    const lines=items.map(item=>{
      const valid=q.src.confirmada?validLine(q,item):null;
      const offered=valid?(valid.disponible>item.q?item.q:valid.disponible):0n;
      const source=q.lines.get(item.id);
      let motivo:string|null=null;
      if(!q.src.confirmada)motivo='oferta_no_confirmada';
      else if(!source)motivo='item_no_cotizado';
      else if(!['verificada','comercial_razonable'].includes(source.equivalencia))motivo='equivalencia_no_verificada';
      else if(source.unidad!==item.unidad)motivo='unidad_diferente';
      else if(offered<item.q)motivo='cantidad_insuficiente';
      return {itemId:item.id,unidad:item.unidad,solicitada:qty(item.q),
        cotizable:qty(offered),completa:offered===item.q,motivo,
        ...(valid?.equivalencia==='comercial_razonable'?{
         advertencia:'alternativa_comercial_con_aclaracion' as const
        }:{})};
    });
    const full=lines.filter(x=>x.completa).length;
    const reasons:string[]=[];
    if(!q.src.confirmada)reasons.push('oferta_no_confirmada');
    if(full!==items.length)reasons.push('cobertura_incompleta');
    if(q.src.formaPago===null)reasons.push('forma_pago_desconocida');
    if(q.src.plazoEntregaDias===null)reasons.push('plazo_desconocido');
    if(q.flete===null)reasons.push('flete_desconocido');
    if(q.minimo===null)reasons.push('minimo_desconocido');
    if(items.some(x=>{const l=validLine(q,x);return l&&l.disponible>=x.q&&linePrice(l,x.q)===null;}))
      reasons.push('precio_o_iva_desconocido');
    const single=candidate(items,qs,items.map(()=>qs.indexOf(q)));
    if(single===null&&full===items.length&&!reasons.length)reasons.push('minimo_no_alcanzado');
    return {anonId:q.src.anonId,confirmada:q.src.confirmada,lineasCompletas:full,
      lineasTotales:items.length,lineas:lines,totalComparable:single?money(single.total):null,
      motivos:reasons};
  });
  const candidates:Candidate[]=[];
  for(let a=0;a<qs.length;a++){
    const c=candidate(items,qs,items.map(()=>a));if(c)candidates.push(c);
  }
  // All-pairs preflight first. If the total estimated work is excessive,
  // withhold EVERY pair result and rank rather than ignoring "late" providers.
  let pairWork=0,pairsExhaustive=true,paresCalculados=0;
  pairPreflight:for(let a=0;a<qs.length;a++){
   for(let b=a+1;b<qs.length;b++){
    const input=pairInputs(items,qs,a,b);
    if(!input)continue;
    if(input.work===null||pairWork+input.work>PAIR_WORK_BUDGET){
     pairsExhaustive=false;break pairPreflight;
    }
    pairWork+=input.work;
   }
  }
  if(pairsExhaustive){
   for(let a=0;a<qs.length;a++)for(let b=a+1;b<qs.length;b++){
    const input=pairInputs(items,qs,a,b);
    if(!input||input.work===null)continue;
    paresCalculados++;
    const best=exactPair(items,qs,a,b,input.prices);
    if(best)candidates.push(best);
   }
  }
  const groupCounts=new Map<string,number>();
  for(const c of candidates)groupCounts.set(c.group,(groupCounts.get(c.group)??0)+1);
  candidates.sort((a,b)=>a.group.localeCompare(b.group)||
    (pairsExhaustive?(a.total<b.total?-1:a.total>b.total?1:0):0)||
    a.ids.join('|').localeCompare(b.ids.join('|'))||
    a.assignment.join('|').localeCompare(b.assignment.join('|')));
  let lastGroup='',lastTotal:bigint|null=null,rank=0;
  const options:OpcionComparacion[]=candidates.map(c=>{
    if(c.group!==lastGroup){lastGroup=c.group;lastTotal=null;rank=0}
    if(lastTotal===null||lastTotal!==c.total){rank++;lastTotal=c.total}
    const warnings=items.flatMap((item,i)=>{
      const q=qs.find(q=>q.src.anonId===c.assignment[i]);
      return q?.lines.get(item.id)?.equivalencia==='comercial_razonable'
       ?[{itemId:item.id,tipo:'alternativa_comercial_con_aclaracion' as const}]:[];
    });
    return {proveedoresAnonimos:c.ids,asignacion:items.map((x,i)=>({itemId:x.id,anonId:c.assignment[i]})),
      moneda:c.currency,formaPago:c.pay,plazoEntregaDias:c.days,totalFinal:money(c.total),
      materialesConIva:money(c.materials),fletesFinal:money(c.freight),
      grupoCondiciones:c.group,
      puestoDentroDeCondiciones:pairsExhaustive&&
        (groupCounts.get(c.group)??0)>1?rank:null,
      ...(warnings.length?{advertencias:warnings}:{})};
  });
  return {estado:'comparacion_offline_sin_adjudicacion',cobertura:coverage,
    opcionesCompletas:options,gruposComparables:groupCounts.size,
    limite:'solo_asignacion_de_lineas_completas_sin_fraccionar',
    optimoGlobalGarantizado:false,
    comparacionPares:pairsExhaustive?'exhaustiva':'suspendida_por_complejidad',
    paresCalculados,
    contactoRevelado:false,adjudicacionAutomatica:false};
}
