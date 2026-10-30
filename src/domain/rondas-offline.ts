/**
 * Cotironda / Etapa 03 - Rondas y versiones OFFLINE.
 *
 * No autentica identidades, empresas ni usuarios. "autoridad" DEBE venir de
 * servidor previamente autenticado/autorizado (nunca del body del cliente).
 * No guarda en DB ni envía WhatsApp. Inmutabilidad local no sustituye SQL/RLS.
 */
import {compararCotizacionesOffline} from './comparacion-ofertas.ts';
import type {PedidoComparable,OfertaComparable,ResultadoComparacion} from './comparacion-ofertas.ts';

type BorradorOferta=Pick<OfertaComparable,
  'moneda'|'formaPago'|'plazoEntregaDias'|'fleteFinal'|'minimoCompraFinal'|'items'>;
export type AutoridadRonda=
  Readonly<{rol:'comprador'|'sistema'}>|
  Readonly<{rol:'proveedor';anonId:string}>;
export type EventoRonda=
  Readonly<{id:string;tipo:'abrir'|'cerrar'|'cancelar';fecha:string}>|
  Readonly<{id:string;tipo:'guardar_borrador';fecha:string;anonId:string;
    revisionEsperada:number;borrador:BorradorOferta}>|
  Readonly<{id:string;tipo:'confirmar_oferta';fecha:string;anonId:string;
    revisionEsperada:number}>;
export type ConfigRonda=Readonly<{
  rondaId:string;inicioEn:string;cierreEn:string;autorizacionDistribucion:true;
  pedido:PedidoComparable;invitadosAnonimos:readonly string[];
}>;
export type VersionOferta=Readonly<{
  version:number;revisionBorrador:number;confirmadoEn:string;
  oferta:OfertaComparable;
}>;
export type ProveedorRonda=Readonly<{
  anonId:string;revisionBorrador:number;borrador:BorradorOferta|null;
  versiones:readonly VersionOferta[];
}>;
type Registro=Readonly<{id:string;huella:string;tipo:EventoRonda['tipo'];fecha:string}>;
export type EstadoRonda=Readonly<{
  rondaId:string;inicioEn:string;cierreEn:string;autorizacionDistribucion:true;
  pedido:PedidoComparable;invitadosAnonimos:readonly string[];
  estado:'programada'|'abierta'|'cerrada'|'cancelada';
  ultimaFecha:string|null;
  proveedores:readonly ProveedorRonda[];
  eventos:readonly Registro[];
  comparacionCierre:ResultadoComparacion|null;
}>;

function reject():never{throw new TypeError('ronda_operacion_no_permitida')}
function shape(x:unknown,keys:readonly string[]):void{
  if(!x||typeof x!=='object'||Array.isArray(x)||
    Object.keys(x).length!==keys.length||
    Object.keys(x).some(k=>!keys.includes(k)))reject();
}
function validId(x:unknown):x is string{
  return typeof x==='string'&&/^[a-z][a-z0-9_]{2,49}$/.test(x);
}
function fechaUtc(x:unknown):x is string{
  return typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)&&
    !Number.isNaN(Date.parse(x))&&new Date(x).toISOString()===x;
}
function natural(x:unknown):x is number{
  return typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
}
function deepFreeze(x:unknown):void{
  if(x&&typeof x==='object'&&!Object.isFrozen(x)){
    for(const v of Object.values(x))deepFreeze(v);
    Object.freeze(x);
  }
}
function finalize<T>(value:T):T{deepFreeze(value);return value}
function copia<T>(v:T):T{
  try{return structuredClone(v)}catch{reject()}
}
function canonical(v:unknown):string{
  if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
  if(v&&typeof v==='object'){
    const obj=v as Record<string,unknown>;
    return '{'+Object.keys(obj).sort().map(k=>JSON.stringify(k)+':'+canonical(obj[k])).join(',')+'}';
  }
  const j=JSON.stringify(v);
  if(j===undefined)reject();
  return j;
}
function validarBorrador(raw:unknown,anonId:string,pedido:PedidoComparable):BorradorOferta{
  shape(raw,['moneda','formaPago','plazoEntregaDias','fleteFinal','minimoCompraFinal','items']);
  const x=raw as BorradorOferta;
  // El comparador valida todas las cantidades, IVA, unidades, ids y campos extra
  // incluso en alternativas incompletas, sin clasificarlas como idénticas.
  compararCotizacionesOffline(pedido,[{
    anonId,version:1,confirmada:true,moneda:x.moneda,
    formaPago:x.formaPago,plazoEntregaDias:x.plazoEntregaDias,
    fleteFinal:x.fleteFinal,minimoCompraFinal:x.minimoCompraFinal,items:x.items
  }]);
  return copia(x);
}
export function crearRondaOffline(config:ConfigRonda):EstadoRonda{
  shape(config,['rondaId','inicioEn','cierreEn','autorizacionDistribucion','pedido','invitadosAnonimos']);
  if(!validId(config.rondaId)||!fechaUtc(config.inicioEn)||!fechaUtc(config.cierreEn)||
    config.cierreEn<=config.inicioEn||config.autorizacionDistribucion!==true||
    !Array.isArray(config.invitadosAnonimos)||config.invitadosAnonimos.length===0||
    config.invitadosAnonimos.length>10)reject();
  // Protección de capacidad del motor offline: hasta 30 días; no implica plazo comercial aprobado.
  if(Date.parse(config.cierreEn)-Date.parse(config.inicioEn)>30*24*60*60*1000)reject();
  const invitados=[...config.invitadosAnonimos];
  if(invitados.some(x=>!validId(x)||!x.startsWith('anon_'))||
    new Set(invitados).size!==invitados.length)reject();
  const pedido=copia(config.pedido);
  compararCotizacionesOffline(pedido,[]);
  return finalize({
    rondaId:config.rondaId,inicioEn:config.inicioEn,cierreEn:config.cierreEn,
    autorizacionDistribucion:true as const,pedido,invitadosAnonimos:invitados,
    estado:'programada' as const,ultimaFecha:null,
    proveedores:invitados.map(anonId=>({
      anonId,revisionBorrador:0,borrador:null,versiones:[] as VersionOferta[]
    })),eventos:[] as Registro[],comparacionCierre:null
  });
}
export function aplicarEventoRondaOffline(
  estado:EstadoRonda,evento:EventoRonda,autoridad:AutoridadRonda
):EstadoRonda{
  // El caller debe obtener la autoridad del contexto autenticado, NO del evento.
  const ev=copia(evento);
  const auth=copia(autoridad);
  if(!ev||typeof ev!=='object'||Array.isArray(ev)||
    !auth||typeof auth!=='object'||Array.isArray(auth)||!('rol' in auth))reject();
  if(!validId(ev.id)||!fechaUtc(ev.fecha)||
    !['abrir','cerrar','cancelar','guardar_borrador','confirmar_oferta'].includes(ev.tipo))reject();
  if(auth.rol==='proveedor'){
    shape(auth,['rol','anonId']);
    if(!validId(auth.anonId)||!auth.anonId.startsWith('anon_')||
      !estado.invitadosAnonimos.includes(auth.anonId))reject();
  }else{
    shape(auth,['rol']);
    if(auth.rol!=='comprador'&&auth.rol!=='sistema')reject();
  }
  const isSupplier=ev.tipo==='guardar_borrador'||ev.tipo==='confirmar_oferta';
  if(isSupplier){
    shape(ev,ev.tipo==='guardar_borrador'?
      ['id','tipo','fecha','anonId','revisionEsperada','borrador']:
      ['id','tipo','fecha','anonId','revisionEsperada']);
    if(auth.rol!=='proveedor'||ev.anonId!==auth.anonId||
      !natural(ev.revisionEsperada))reject();
  }else{
    shape(ev,['id','tipo','fecha']);
    if(ev.tipo==='abrir'&&auth.rol!=='comprador')reject();
    if(ev.tipo==='cancelar'&&auth.rol!=='comprador')reject();
    if(ev.tipo==='cerrar'&&auth.rol!=='comprador'&&auth.rol!=='sistema')reject();
  }
  const huella=canonical([ev,auth]);
  const previo=estado.eventos.find(x=>x.id===ev.id);
  if(previo){
    if(previo.huella!==huella)reject();
    return estado; // reenvío idéntico: ninguna transición ni versión extra.
  }
  // Límite conservador de laboratorio. Persistencia real requerirá límites por empresa.
  if(estado.eventos.length>=500)reject();
  if(estado.ultimaFecha!==null&&ev.fecha<estado.ultimaFecha)reject();
  const proveedores:ProveedorRonda[]=estado.proveedores.map(x=>({
    anonId:x.anonId,revisionBorrador:x.revisionBorrador,
    borrador:x.borrador,versiones:[...x.versiones]
  }));
  let nuevo:EstadoRonda['estado']=estado.estado;
  let comparacion=estado.comparacionCierre;
  if(ev.tipo==='abrir'){
    if(estado.estado!=='programada'||ev.fecha<estado.inicioEn||
      ev.fecha>=estado.cierreEn)reject();
    nuevo='abierta';
  }else if(ev.tipo==='cancelar'){
    if(!['programada','abierta'].includes(estado.estado))reject();
    nuevo='cancelada';
  }else if(ev.tipo==='cerrar'){
    if(estado.estado!=='abierta'||ev.fecha<estado.cierreEn)reject();
    nuevo='cerrada';
    // Última versión CONFIRMADA de cada invitado, nunca el borrador sin confirmar.
    const ofertas=proveedores.flatMap(p=>p.versiones.length?
      [p.versiones[p.versiones.length-1].oferta]:[]);
    comparacion=compararCotizacionesOffline(estado.pedido,ofertas);
  }else{
    if(estado.estado!=='abierta'||ev.fecha<estado.inicioEn||
      ev.fecha>=estado.cierreEn)reject();
    const target=proveedores.find(x=>x.anonId===ev.anonId);
    if(!target)reject();
    if(ev.tipo==='guardar_borrador'){
      if(ev.revisionEsperada!==target.revisionBorrador)reject();
      const next=validarBorrador(ev.borrador,ev.anonId,estado.pedido);
      const index=proveedores.indexOf(target);
      proveedores[index]={...target,revisionBorrador:target.revisionBorrador+1,
        borrador:next};
    }else{
      if(target.borrador===null||target.revisionBorrador!==ev.revisionEsperada||
        target.versiones.some(v=>v.revisionBorrador===ev.revisionEsperada))reject();
      const version=target.versiones.length+1;
      const oferta:OfertaComparable={
        anonId:target.anonId,version,confirmada:true,
        ...copia(target.borrador)
      };
      // Incluso si fue guardado antes, confirmar exige nuevo control del comparador.
      compararCotizacionesOffline(estado.pedido,[oferta]);
      const confirmado:VersionOferta={
        version,revisionBorrador:ev.revisionEsperada,
        confirmadoEn:ev.fecha,oferta
      };
      const index=proveedores.indexOf(target);
      proveedores[index]={...target,versiones:[...target.versiones,confirmado]};
    }
  }
  return finalize({
    ...estado,estado:nuevo,ultimaFecha:ev.fecha,proveedores,
    eventos:[...estado.eventos,{id:ev.id,huella,tipo:ev.tipo,fecha:ev.fecha}],
    comparacionCierre:comparacion
  });
}
