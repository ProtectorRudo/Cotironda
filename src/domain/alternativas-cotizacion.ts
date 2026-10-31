/**
 * Etapa 02 — propuestas conservadoras de cotización con presentaciones distintas.
 * Nunca envía invitaciones ni sustituye el pedido del comprador.
 * Los requisitos técnicos, relaciones curadas y catálogos tienen que provenir
 * de un backend autorizado. La IA no puede acreditar equivalencias.
 */
import type {BorradorDocumental, LineaDocumental} from './extraccion-documental.ts';
import type {ProveedorConfirmado, SolicitudAutomatica} from './despacho-automatico.ts';
import type {Rubro, Unidad} from './catalogo.ts';

export type Magnitud = 'kg' | 'l';
export type RequisitoTecnico = Readonly<{
  fila: number;
  descripcion_original: string;
  rubro: Rubro;
  unidad_solicitada: Unidad;
  familia_tecnica: string;
  especificacion_clave: string;
  magnitud: Magnitud;
  contenido_por_unidad_solicitada: string;
}>;
export type SkuAlternativo = Readonly<{
  sku: string;
  descripcion: string;
  rubro: Rubro;
  unidad_venta: Unidad;
  familia_tecnica: string;
  especificacion_clave: string;
  magnitud: Magnitud;
  contenido_por_envase: string;
  marca: string | null;
  confirmado_por_proveedor: true;
}>;
export type ProveedorConPresentaciones = ProveedorConfirmado & Readonly<{
  presentaciones_confirmadas: readonly SkuAlternativo[];
}>;
export type RelacionParaConsulta = Readonly<{
  descripcion_pedida: string;
  sku_proveedor: string;
  rubro: Rubro;
  uso_a_verificar: string;
  curada: true;
}>;
export type AlternativaPresentacion = Readonly<{
  tipo: 'presentacion_alternativa';
  fila: number;
  pedido_original: string;
  cantidad_pedida: string;
  unidad_pedida: Unidad;
  sku: string;
  descripcion_propuesta: string;
  envases_cotizables: string;
  unidad_venta: Unidad;
  magnitud: Magnitud;
  contenido_requerido: string;
  contenido_ofrecido: string;
  excedente: string;
  estado_tecnico: 'requiere_confirmacion_proveedor';
  comparable_como_identico: false;
}>;
export type ConsultaFuncional = Readonly<{
  tipo: 'consulta_funcional';
  fila: number;
  pedido_original: string;
  cantidad_pedida: string;
  unidad_pedida: Unidad;
  sku: string;
  descripcion_propuesta: string;
  advertencia: string;
  estado_tecnico: 'requiere_verificar_uso_y_ficha';
  comparable_como_identico: false;
}>;
export type PropuestaAlternativa = AlternativaPresentacion | ConsultaFuncional;
export type PlanAlternativas = Readonly<{
  estado: 'simulacion_alternativas_sin_envio';
  propuestas: {proveedor_id:string;clave_idempotencia:string;items:PropuestaAlternativa[]}[];
  retenidas: {fila:number;motivo:'datos_inseguros'|'duplicado'|'sin_alternativa_confirmada'}[];
}>;

const canon=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('es-AR').replace(/\s+/g,' ').trim();
const valido=(s:unknown,max=160):s is string=>typeof s==='string' &&
  s.trim().length>=2 && s.length<=max && !/[\u0000-\u001f]/.test(s);
const idValido=(s:unknown)=>typeof s==='string'&&/^[A-Za-z0-9_-]{4,80}$/.test(s);
const zonaValida=(s:unknown)=>typeof s==='string'&&/^[A-Za-z0-9_-]{2,40}$/.test(s);
const positivo=(x:string):bigint|null=>{
  if(typeof x!=='string'||!/^\d{1,6}(?:[,.]\d{1,2})?$/.test(x))return null;
  const [i,f='']=x.replace(',','.').split('.');
  const n=BigInt(i)*100n+BigInt((f+'00').slice(0,2));
  return n>0n?n:null;
};
const formato=(centi:bigint)=>{
  const a=centi/100n,b=centi%100n;
  return b===0n?String(a):String(a)+'.'+String(b).padStart(2,'0').replace(/0+$/,'');
};
function confiable(l:LineaDocumental):boolean {
  return l.requiere_aclaracion.length===0 && l.confianza_declarada!==null &&
    l.confianza_declarada>=0.95 && l.cantidad!==null && positivo(l.cantidad)!==null &&
    l.unidad!==null && l.rubro!==null &&
    l.producto_normalizado!==null && canon(l.descripcion_original)===canon(l.producto_normalizado);
}
function verificarDatos(solicitud:SolicitudAutomatica,borrador:BorradorDocumental,
  requisitos:readonly RequisitoTecnico[],proveedores:readonly ProveedorConPresentaciones[],
  relaciones:readonly RelacionParaConsulta[]) {
  if(!idValido(solicitud?.id)||!zonaValida(solicitud?.zona_entrega)||
    solicitud.envio_autorizado_por_comprador!==true)
    throw new TypeError('solicitud_sin_autorizacion');
  if(borrador?.estado!=='pendiente_despacho_automatico'||
    !Array.isArray(borrador.lineas)||!Array.isArray(borrador.posibles_duplicados)||
    !Array.isArray(requisitos)||!Array.isArray(proveedores)||!Array.isArray(relaciones)||
    borrador.lineas.length>100||requisitos.length>100||proveedores.length>100||
    relaciones.length>2000)throw new TypeError('alternativas_entrada_invalida');
  const ids=new Set<string>();
  for(const p of proveedores) {
    if(!idValido(p?.id)||ids.has(p.id)||!Array.isArray(p.zonas_entrega)||
      !Array.isArray(p.catalogo_confirmado)||
      !Array.isArray(p.presentaciones_confirmadas)||
      p.presentaciones_confirmadas.length>100)throw new TypeError('alternativas_catalogo_invalido');
    ids.add(p.id);
    const skus=new Set<string>();
    for(const s of p.presentaciones_confirmadas) {
      if(s?.confirmado_por_proveedor!==true||!idValido(s.sku)||
        skus.has(s.sku)||!valido(s.descripcion,250)||
        !valido(s.familia_tecnica)||!valido(s.especificacion_clave)||
        !['kg','l'].includes(s.magnitud)||positivo(s.contenido_por_envase)===null)
        throw new TypeError('alternativas_sku_no_confirmado');
      skus.add(s.sku);
    }
  }
  const indices=new Set<number>();
  for(const req of requisitos){
    if(!Number.isInteger(req?.fila)||req.fila<1||req.fila>100||
      indices.has(req.fila)||!valido(req.descripcion_original,300)||
      !valido(req.familia_tecnica)||!valido(req.especificacion_clave)||
      !['kg','l'].includes(req.magnitud)||
      positivo(req.contenido_por_unidad_solicitada)===null)
      throw new TypeError('alternativas_requisito_invalido');
    indices.add(req.fila);
  }
  for(const rel of relaciones){
    if(rel?.curada!==true||!valido(rel.descripcion_pedida,300)||
      !idValido(rel.sku_proveedor)||!valido(rel.uso_a_verificar,250))
      throw new TypeError('alternativas_relacion_no_curada');
  }
}

/** Solo propuestas OFFLINE para solicitar cotización; nunca puede aprobar equivalencia. */
export function proponerAlternativasDeCotizacion(args:{
  solicitud:SolicitudAutomatica;
  borrador:BorradorDocumental;
  requisitos:readonly RequisitoTecnico[];
  proveedores:readonly ProveedorConPresentaciones[];
  relaciones:readonly RelacionParaConsulta[];
}):PlanAlternativas {
  const {solicitud,borrador,requisitos,proveedores,relaciones}=args;
  verificarDatos(solicitud,borrador,requisitos,proveedores,relaciones);
  const indiceReq=new Map(requisitos.map(r=>[r.fila,r]));
  const duplicadas=new Set<number>();
  for(const d of borrador.posibles_duplicados){
    duplicadas.add(d.fila);duplicadas.add(d.primeraFila);
  }
  const zonas=proveedores.filter(p=>p.activo===true&&p.opt_out===false&&
    p.consentimiento_whatsapp===true&&p.zonas_entrega.some(z=>
      zonaValida(z)&&canon(z)===canon(solicitud.zona_entrega)));
  const planes=new Map<string,PropuestaAlternativa[]>();
  const retenidas:PlanAlternativas['retenidas']=[];
  for(const l of borrador.lineas){
    if(duplicadas.has(l.fila)){retenidas.push({fila:l.fila,motivo:'duplicado'});continue;}
    if(!confiable(l)){retenidas.push({fila:l.fila,motivo:'datos_inseguros'});continue;}
    const req=indiceReq.get(l.fila);
    const compatible=!!req && canon(req.descripcion_original)===canon(l.descripcion_original) &&
      req.rubro===l.rubro && req.unidad_solicitada===l.unidad;
    let n=0;
    for(const proveedor of zonas){
      for(const sku of proveedor.presentaciones_confirmadas){
        if(sku.rubro!==l.rubro)continue;
        if(l.marca_obligatoria && (!valido(l.marca)||!valido(sku.marca)||
          canon(l.marca)!==canon(sku.marca)))continue;
        let propuesta:PropuestaAlternativa|null=null;
        // Las presentaciones requieren misma clase y atributos críticos;
        // no se usa «parecido» ni se transforma kg↔l.
        if(compatible && canon(req!.familia_tecnica)===canon(sku.familia_tecnica) &&
          canon(req!.especificacion_clave)===canon(sku.especificacion_clave)&&
          req!.magnitud===sku.magnitud){
          const count=positivo(l.cantidad!),porUnidad=positivo(req!.contenido_por_unidad_solicitada);
          const contenido=positivo(sku.contenido_por_envase);
          if(count && porUnidad && contenido) {
            const producto=count*porUnidad;
            if(producto%100n===0n){
              const requerido=producto/100n;
              const envases=(requerido+contenido-1n)/contenido;
              if(envases>0n&&envases<=1000000n){
                const ofrecido=envases*contenido;
                if(canon(sku.descripcion)!==canon(l.descripcion_original) ||
                  requerido!==ofrecido || sku.unidad_venta!==l.unidad) {
                  propuesta={
                    tipo:'presentacion_alternativa',fila:l.fila,
                    pedido_original:l.descripcion_original,cantidad_pedida:l.cantidad!,
                    unidad_pedida:l.unidad!,sku:sku.sku,descripcion_propuesta:sku.descripcion,
                    envases_cotizables:String(envases),unidad_venta:sku.unidad_venta,
                    magnitud:sku.magnitud,contenido_requerido:formato(requerido),
                    contenido_ofrecido:formato(ofrecido),excedente:formato(ofrecido-requerido),
                    estado_tecnico:'requiere_confirmacion_proveedor',comparable_como_identico:false
                  };
                }
              }
            }
          }
        }
        // Consulta curada: incluso con relación aceptada NO se afirma
        // equivalencia ni se inventa conversión de unidad/volumen.
        if(!propuesta && !l.marca_obligatoria){
          const relacion=relaciones.find(x=>x.curada===true&&
            canon(x.descripcion_pedida)===canon(l.descripcion_original)&&
            x.sku_proveedor===sku.sku&&x.rubro===l.rubro);
          if(relacion) propuesta={
            tipo:'consulta_funcional',fila:l.fila,pedido_original:l.descripcion_original,
            cantidad_pedida:l.cantidad!,unidad_pedida:l.unidad!,
            sku:sku.sku,descripcion_propuesta:sku.descripcion,
            advertencia:relacion.uso_a_verificar,
            estado_tecnico:'requiere_verificar_uso_y_ficha',comparable_como_identico:false
          };
        }
        if(propuesta){
          const items=planes.get(proveedor.id)??[];
          items.push(propuesta);planes.set(proveedor.id,items);n++;
        }
      }
    }
    if(n===0)retenidas.push({fila:l.fila,motivo:'sin_alternativa_confirmada'});
  }
  return{
    estado:'simulacion_alternativas_sin_envio',
    propuestas:[...planes].map(([proveedor_id,items])=>({
      proveedor_id,clave_idempotencia:solicitud.id+':alt:'+proveedor_id,items
    })),
    retenidas
  };
}
