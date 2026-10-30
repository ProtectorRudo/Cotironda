/**
 * Etapa 02 — acceso ECONÓMICO sin tokens a D015 para listas simples.
 * Nunca interpreta dudas como hechos: las manda a pendientes_ia, sin invocar
 * OpenAI automáticamente. Es un contrato offline, NO un endpoint público.
 */
import {extraerLinea} from './flujo-texto.ts';
import {prepararBorradorDocumental,type BorradorDocumental} from './extraccion-documental.ts';
import type {SolicitudAutomatica} from './despacho-automatico.ts';
import type {ProveedorPorProducto} from './identidad-producto.ts';
import {identificarProducto,simularInvitacionesDesdeBorrador,
  type ResolucionProducto} from './taxonomia-materiales.ts';
import type {PlanInvitacionPorProducto} from './invitaciones-por-producto.ts';

export type LineaPendienteIA=Readonly<{
  numero_linea:number;
  motivo:'sintaxis_no_segura'|'producto_no_identificado'|'descripcion_demasiado_libre'|
    'cantidad_ambigua'|'marca_exclusiva_no_confirmada'|'retencion_documental';
}>;
export type ResultadoEntradaEconomica=Readonly<{
  estado:'plan_texto_economico_sin_envio';
  motor:'reglas_locales_sin_tokens';
  tokens_consumidos:0;
  llamadas_ia:0;
  borrador:BorradorDocumental;
  resolucion:ResolucionProducto;
  plan:PlanInvitacionPorProducto;
  pendientes_ia:LineaPendienteIA[];
  resumen:{lineas:number;lineas_aprovechadas:number;lineas_pendientes_ia:number;proveedores:number};
}>;

const canon=(s:string):string=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('es-AR').trim().replace(/\s+/g,' ');
const comun=new Set(['de','del','la','el','los','las','para','por','obra','marca',
  'blanco','blanca','gris','grises','comun','comunes','bolsa','bolsas',
  'lata','latas','bidon','bidones','litro','litros','kg','kilo','kilos','mm','mm2','l','m',
  'unidad','unidades','placa','placas','tubo','tubos','cano','canos','pvc']);
const tokens:Readonly<Record<string,readonly string[]>>={
  cemento_gris_obra:['cemento','cementos','portland','loma','negra','avellaneda',
    'holcim','cpc','cpn','cpp','rapida','rapido','25','35','40','50'],
  hidrofugo:['hidrofugo','hidrofugos','ceresita','liquido','liquida','impermeabilizante'],
  pintura_latex:['pintura','pinturas','latex','interior','exterior','mate','satinado',
    'brillante','blanco','blanca','color','20','18','10','4','5'],
  placa_yeso:['yeso','durlock','rh','rf','st','humedad','fuego','12','12,5','9,5','15','mm'],
  cable_unipolar:['cable','cables','electrico','electricos','unipolar','unipolares',
    'cobre','pvc','xlpe','mm2','2,5','1,5','4','6'],
  cano_pvc:['cano','canos','de','pvc','tubo','tubos','sanitario','sanitarios',
    'cloacal','cloacales','desague','desagüe','110','50','40','63','75']
};
function descripcionSimple(s:string,producto_id:string):boolean {
  const palabras=new Set([...(tokens[producto_id]??[]),...comun]);
  const parts=canon(s).split(/[\s,;:/()\-]+/u).filter(Boolean);
  if(parts.length===0||parts.length>20)return false;
  return parts.every(p=>palabras.has(p) || /^\d{1,3}(?:[.,]\d{1,2})?$/.test(p) ||
    /^\d{1,3}(?:[.,]\d{1,2})?(?:kg|l|mm|mm2)$/.test(p));
}
const exclusividad=/\b(?:solo|solamente|unicamente|exclusivamente|obligatoria|exclusiva|sustitutos|reemplazos)\b/iu;
function marcaConocida(s:string):string|null{
  const n=canon(s);
  for(const marca of ['loma negra','avellaneda','holcim'])
    if(new RegExp('(?:^|[^a-z])'+marca+'(?=$|[^a-z])','u').test(n))
      return marca.replace(/\b[a-z]/g,ch=>ch.toUpperCase());
  return null;
}
export function simularInvitacionesEconomicasDesdeTexto(args:{
  texto:string;
  solicitud:SolicitudAutomatica;
  proveedores:readonly ProveedorPorProducto[];
}):ResultadoEntradaEconomica {
  const {texto,solicitud,proveedores}=args;
  if(typeof texto!=='string'||texto.length===0||texto.length>9000||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(texto))
    throw new TypeError('texto_economico_invalido');
  const entradas=texto.split(/\r\n|\r|\n/u).map((raw,i)=>({raw:raw.trim(),n:i+1}))
    .filter(x=>x.raw.length>0);
  if(entradas.length===0||entradas.length>25)throw new RangeError('lineas_economicas_invalidas');
  const pendientes:LineaPendienteIA[]=[];
  const datos=entradas.map(({raw,n})=>{
    const limpio=raw.replace(/^(?:[-*•]\s+|\d{1,3}[).]\s+)/u,'').trim();
    const parsed=limpio.length<=350?extraerLinea(limpio):null;
    const hallazgo=parsed?identificarProducto(parsed.producto):null;
    const cantidad=parsed?.cantidad??null;
    const ambigua=typeof cantidad==='string'&&
      /^\d{1,6}[,.]\d{3}$/u.test(cantidad);
    const marca=hallazgo&&parsed?marcaConocida(parsed.producto):null;
    const expreso=parsed&&exclusividad.test(canon(parsed.producto));
    const simple=hallazgo&&parsed?descripcionSimple(parsed.producto,hallazgo.producto_id):false;
    let motivo:LineaPendienteIA['motivo']|null=null;
    if(!parsed)motivo='sintaxis_no_segura';
    else if(ambigua)motivo='cantidad_ambigua';
    else if(!hallazgo)motivo='producto_no_identificado';
    else if(expreso)motivo='marca_exclusiva_no_confirmada';
    else if(!simple)motivo='descripcion_demasiado_libre';
    if(motivo)pendientes.push({numero_linea:n,motivo});
    return {
      ubicacion:'Texto, línea '+n,
      descripcion_original:parsed?.producto??(limpio.slice(0,300)||'Línea no interpretable'),
      producto_normalizado:parsed?.producto??null,
      cantidad,unidad:parsed?.unidad??null,
      rubro:(!motivo&&hallazgo)?hallazgo.rubro:null,
      marca,marca_obligatoria:false,
      // 1 = sintaxis y familia deterministas, NO confianza de modelo.
      confianza:motivo?null:1
    };
  });
  const borrador=prepararBorradorDocumental('texto',{items:datos});
  const resultado=simularInvitacionesDesdeBorrador({solicitud,borrador,proveedores});
  const ids=new Set(pendientes.map(p=>p.numero_linea));
  for(const line of resultado.resolucion.retenidas){
    const index=borrador.lineas.find(x=>x.fila===line.fila);
    const m=index?.ubicacion.match(/^Texto, línea (\d+)$/u);
    const num=m?Number(m[1]):line.fila;
    if(!ids.has(num)){
      pendientes.push({numero_linea:num,motivo:'retencion_documental'});
      ids.add(num);
    }
  }
  for(const item of resultado.plan.retenidas){
    if(item.motivo==='duplicado_dudoso'||item.motivo==='linea_insegura'){
      const num=entradas[item.fila-1]?.n??item.fila;
      if(!ids.has(num)){
        pendientes.push({numero_linea:num,motivo:'retencion_documental'});ids.add(num);
      }
    }
  }
  pendientes.sort((a,b)=>a.numero_linea-b.numero_linea);
  const exitos=new Set(resultado.plan.invitaciones.flatMap(i=>i.items.map(x=>x.fila)));
  return{
    estado:'plan_texto_economico_sin_envio',
    motor:'reglas_locales_sin_tokens',
    tokens_consumidos:0,llamadas_ia:0,
    borrador,resolucion:resultado.resolucion,plan:resultado.plan,
    pendientes_ia:pendientes,
    resumen:{
      lineas:entradas.length,
      lineas_aprovechadas:exitos.size,
      lineas_pendientes_ia:pendientes.length,
      proveedores:resultado.plan.invitaciones.length
    }
  };
}
