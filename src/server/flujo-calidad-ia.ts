/**
 * D016 - IA PRIORITARIA para calidad y cobertura.
 * Prepara planes sin enviar mensajes ni realizar adjudicaciones.
 * Ninguna línea original desaparece del informe: omisiones y retenciones
 * se muestran explícitamente, incluso si el resto de la lista está listo.
 */
import type {SolicitudAutomatica} from '../domain/despacho-automatico.ts';
import type {ProveedorPorProducto} from '../domain/identidad-producto.ts';
import {simularInvitacionesConIA} from './openai-extraccion.ts';

export type EstadoLineaCalidad =
  'preparada_para_consultar'|'parcial'|'retenida'|
  'sin_proveedor_confirmado'|'omitida_por_ia';

export type InformeLineaCalidad=Readonly<{
  linea_fuente:number;
  estado:EstadoLineaCalidad;
  articulos_detectados:number;
  articulos_preparados:number;
  proveedores_candidatos:number;
  segmentos_fuente_estimados:number;
  segmentos_sin_extraccion:number;
  motivos:readonly string[];
}>;

export type PlanCalidadPrioritaria=Readonly<{
  estado:'plan_calidad_prioritaria_sin_envio';
  estrategia:'ia_primero';
  modelo:string;
  tokens:{entrada:number;salida:number}|null;
  lineas:InformeLineaCalidad[];
  resumen:{
    lineas_originales:number;
    completas:number;
    parciales:number;
    retenidas:number;
    omitidas:number;
    sin_proveedor:number;
    proveedores_preparados:number;
    segmentos_fuente_estimados:number;
    segmentos_sin_extraccion:number;
    pedido_totalmente_cubierto:boolean;
  };
  // Solo consulta; jamás envío real. Mantiene la estructura completa del
  // extractor + matcher para auditoría de cada selección por catálogo.
  resultado:Awaited<ReturnType<typeof simularInvitacionesConIA>>;
}>;

function indiceFuente(ubicacion:string):number|null{
  const m=/^Texto, línea ([1-9]\d*)$/u.exec(ubicacion);
  return m?Number(m[1]):null;
}

/**
 * El caller servidor autentica identidad, empresa, cuota y uso razonable,
 * obtiene catálogos confirmados y provee la credencial desde Secret Manager.
 * Este módulo no hace consultas si habilitarLlamadaExterna=false.
 */
export async function simularRondaConCalidadIA(args:{
  texto:string;
  apiKey:string;
  habilitarLlamadaExterna:boolean;
  fetchImpl?:typeof fetch;
  solicitud:SolicitudAutomatica;
  proveedores:readonly ProveedorPorProducto[];
}):Promise<PlanCalidadPrioritaria>{
  // Los límites y el preflight del comprador/proveedores se implementan en
  // simularInvitacionesConIA -> extraerMaterialesConIA.
  const r=await simularInvitacionesConIA(args);
  const original=args.texto.split(/\r\n|\r|\n/u).map(s=>s.trim()).filter(Boolean);
  const extraidos=r.extraccion.borrador.lineas;
  const resolucion=r.distribucion.resolucion;
  const plan=r.distribucion.plan;

  const preparadas=new Map<number,Set<string>>();
  for(const destino of plan.invitaciones){
    for(const item of destino.items){
      const set=preparadas.get(item.fila)??new Set<string>();
      set.add(destino.proveedor_id);
      preparadas.set(item.fila,set);
    }
  }
  const motivosPorItem=new Map<number,string[]>();
  const agregar=(fila:number,motivo:string)=>{
    const razones=motivosPorItem.get(fila)??[];
    if(!razones.includes(motivo))razones.push(motivo);
    motivosPorItem.set(fila,razones);
  };
  for(const linea of extraidos)
    for(const motivo of linea.requiere_aclaracion)agregar(linea.fila,motivo);
  for(const r of resolucion.retenidas)agregar(r.fila,r.motivo);
  for(const r of plan.retenidas)agregar(r.fila,r.motivo);

  const omitidas=new Set(r.extraccion.lineas_sin_extraccion);
  const totalSegmentos=new Map(r.extraccion.segmentos_fuente.map(s=>
    [s.linea_fuente,s.segmentos]));
  const segmentosPendientes=new Map<number,number>();
  for(const s of r.extraccion.segmentos_sin_extraccion)
    segmentosPendientes.set(s.linea_fuente,
      (segmentosPendientes.get(s.linea_fuente)??0)+1);
  const lineas:InformeLineaCalidad[]=original.map((_,i)=>{
    const fuente=i+1;
    const items=extraidos.filter(x=>indiceFuente(x.ubicacion)===fuente);
    const ids=new Set(items.map(x=>x.fila));
    const pendientes=segmentosPendientes.get(fuente)??0;
    const segmentos=totalSegmentos.get(fuente)??1;
    const proveedores=new Set<string>();
    let preparados=0;
    const razones=new Set<string>();
    for(const item of items){
      const p=preparadas.get(item.fila);
      if(p?.size){preparados++;for(const pr of p)proveedores.add(pr);}
      for(const x of motivosPorItem.get(item.fila)??[])razones.add(x);
    }
    if(pendientes>0)razones.add('segmento_sin_extraccion');
    let estado:EstadoLineaCalidad;
    if(!items.length||omitidas.has(fuente)){
      estado='omitida_por_ia';razones.add('linea_sin_extraccion');
    }else if(preparados>0&&preparados<items.length){
      estado='parcial';
    }else if(preparados>0&&(pendientes>0||razones.size)){
      estado='parcial';
    }else if(preparados===items.length){
      estado='preparada_para_consultar';
    }else if([...ids].some(id=>(motivosPorItem.get(id)??[])
      .includes('sin_proveedor_que_trabaje_producto')) &&
      ![...ids].some(id=>(motivosPorItem.get(id)??[]).some(m=>
        m!=='sin_proveedor_que_trabaje_producto'))){
      estado='sin_proveedor_confirmado';
    }else{
      estado='retenida';
    }
    return{
      linea_fuente:fuente,estado,
      articulos_detectados:items.length,articulos_preparados:preparados,
      proveedores_candidatos:proveedores.size,
      segmentos_fuente_estimados:segmentos,
      segmentos_sin_extraccion:pendientes,
      motivos:[...razones].sort()
    };
  });

  const count=(estado:EstadoLineaCalidad)=>lineas.filter(l=>l.estado===estado).length;
  return{
    estado:'plan_calidad_prioritaria_sin_envio',
    estrategia:'ia_primero',
    modelo:r.extraccion.modelo,
    tokens:r.extraccion.tokens,
    lineas,
    resumen:{
      lineas_originales:original.length,
      completas:count('preparada_para_consultar'),
      parciales:count('parcial'),
      retenidas:count('retenida'),
      omitidas:count('omitida_por_ia'),
      sin_proveedor:count('sin_proveedor_confirmado'),
      proveedores_preparados:plan.invitaciones.length,
      segmentos_fuente_estimados:lineas.reduce((n,l)=>n+l.segmentos_fuente_estimados,0),
      segmentos_sin_extraccion:lineas.reduce((n,l)=>n+l.segmentos_sin_extraccion,0),
      pedido_totalmente_cubierto:
        lineas.length>0&&lineas.every(l=>l.estado==='preparada_para_consultar')
    },
    resultado:r
  };
}
