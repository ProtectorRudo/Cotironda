/**
 * D014 — producto canónico primero; marca y presentación como variantes.
 * Solamente clasifica candidatos para cotizar OFFLINE: NO encola, NO envía y
 * NO certifica que una oferta cumpla la necesidad del comprador.
 *
 * Identidad de producto y atributos técnicos deben venir de catálogo
 * curado/validado en backend; NUNCA de una instrucción del documento/LLM.
 */
import type {BorradorDocumental, LineaDocumental} from './extraccion-documental.ts';
import type {ProveedorConfirmado, SolicitudAutomatica} from './despacho-automatico.ts';
import type {Rubro, Unidad} from './catalogo.ts';

export type UnidadBase = 'kg' | 'l' | 'unit' | 'm' | 'm2';
export type AtributoCritico = Readonly<{codigo:string; valor:string}>;
export type RequisitoPorProducto = Readonly<{
  fila:number;
  descripcion_original:string;
  producto_id:string;
  rubro:Rubro;
  unidad_pedido:Unidad;
  // Ej.: 20 bolsas de 50 kg => cantidad 20, contenido 50, base kg.
  contenido_por_unidad_pedida:string;
  unidad_base:UnidadBase;
  atributos_criticos:readonly AtributoCritico[];
  especificaciones_verificadas:boolean;
}>;
export type SkuPorProducto = Readonly<{
  sku:string;
  descripcion:string;
  producto_id:string;
  rubro:Rubro;
  marca:string|null;
  unidad_venta:Unidad;
  contenido_por_envase:string;
  unidad_base:UnidadBase;
  atributos_criticos:readonly AtributoCritico[];
  especificaciones_verificadas:boolean;
  confirmado_por_proveedor:true;
}>;
export type ProveedorPorProducto = ProveedorConfirmado & Readonly<{
  skus_confirmados:readonly SkuPorProducto[];
}>;
export type OpcionCotizable = Readonly<{
  sku:string;
  descripcion:string;
  marca:string|null;
  clase:'producto_compatible'|'consulta_especificacion';
  motivo:string;
  envases_a_cotizar:string|null;
  unidad_venta:Unidad;
  unidad_base:UnidadBase;
  cantidad_requerida:string;
  cantidad_ofrecida:string|null;
  excedente:string|null;
  comparable_como_identico:false;
}>;
export type ItemCotizable = Readonly<{
  fila:number;
  pedido_original:string;
  producto_id:string;
  marca_solicitada:string|null;
  marca_obligatoria:boolean;
  opciones:OpcionCotizable[];
}>;
export type PlanPorProducto = Readonly<{
  estado:'plan_producto_primero_sin_envio';
  solicitudes:{proveedor_id:string;clave_idempotencia:string;items:ItemCotizable[]}[];
  retenidas:{fila:number;motivo:'datos_inseguros'|'duplicado'|'sin_producto_compatible'}[];
}>;

const canon=(s:string):string=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('es-AR').replace(/\s+/g,' ').trim();
const esTexto=(v:unknown,max=180):v is string=>typeof v==='string'&&
  v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f]/.test(v);
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-z0-9][a-z0-9_-]{2,79}$/.test(v);
const zona=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{2,40}$/.test(v);
const bases:readonly string[]=['kg','l','unit','m','m2'];
// Dos decimales exactos. Ni float ni separadores de miles ambiguos.
function centi(s:string):bigint|null {
  if(typeof s!=='string'||!/^\d{1,6}(?:[,.]\d{1,2})?$/.test(s))return null;
  const [i,d='']=s.replace(',','.').split('.');
  const n=BigInt(i)*100n+BigInt((d+'00').slice(0,2));
  return n>0n?n:null;
}
function decimal(n:bigint):string{
  const ent=n/100n,frac=n%100n;
  return frac===0n?String(ent):String(ent)+'.'+String(frac).padStart(2,'0').replace(/0+$/,'');
}
function mapaAtributos(lista:readonly AtributoCritico[],requerir:boolean):Map<string,string>{
  if(!Array.isArray(lista)||lista.length>24||(requerir&&lista.length===0))
    throw new TypeError('atributos_criticos_invalidos');
  const m=new Map<string,string>();
  for(const a of lista){
    if(!id(a?.codigo)||!esTexto(a.valor,120)||m.has(a.codigo))
      throw new TypeError('atributos_criticos_invalidos');
    m.set(a.codigo,canon(a.valor));
  }
  return m;
}
function cotejarAtributos(a:Map<string,string>,b:Map<string,string>):
  'compatible'|'incompatible'|'consulta' {
  for(const [k,v] of a)if(b.has(k)&&b.get(k)!==v)return 'incompatible';
  for(const [k,v] of b)if(a.has(k)&&a.get(k)!==v)return 'incompatible';
  if(a.size!==b.size)return 'consulta';
  for(const [k,v] of a)if(b.get(k)!==v)return 'consulta';
  return 'compatible';
}
function validaLinea(linea:LineaDocumental,req:RequisitoPorProducto):boolean {
  return linea.requiere_aclaracion.length===0 &&
    linea.confianza_declarada!==null&&linea.confianza_declarada>=0.95 &&
    esTexto(linea.descripcion_original,300)&&
    canon(linea.descripcion_original)===canon(req.descripcion_original)&&
    linea.cantidad!==null&&centi(linea.cantidad)!==null &&
    linea.unidad===req.unidad_pedido && linea.rubro===req.rubro &&
    (!linea.marca_obligatoria || esTexto(linea.marca));
}
function validar(solicitud:SolicitudAutomatica,borrador:BorradorDocumental,
  requisitos:readonly RequisitoPorProducto[],proveedores:readonly ProveedorPorProducto[]) {
  if(!id(solicitud?.id)||!zona(solicitud?.zona_entrega)||
    solicitud.envio_autorizado_por_comprador!==true)
    throw new TypeError('solicitud_sin_autorizacion');
  if(borrador?.estado!=='pendiente_despacho_automatico'||
    !Array.isArray(borrador.lineas)||borrador.lineas.length>100||
    !Array.isArray(borrador.posibles_duplicados)||
    !Array.isArray(requisitos)||requisitos.length>100||
    !Array.isArray(proveedores)||proveedores.length>100)
    throw new TypeError('identidad_entrada_invalida');
  const seen=new Set<number>();
  for(const r of requisitos){
    if(!Number.isInteger(r?.fila)||r.fila<1||r.fila>100||seen.has(r.fila)||
      !esTexto(r.descripcion_original,300)||!id(r.producto_id)||
      !bases.includes(r.unidad_base)||centi(r.contenido_por_unidad_pedida)===null||
      typeof r.especificaciones_verificadas!=='boolean')
      throw new TypeError('identidad_requisito_invalido');
    seen.add(r.fila);mapaAtributos(r.atributos_criticos,r.especificaciones_verificadas);
  }
  const ids=new Set<string>();
  for(const p of proveedores){
    if(!id(p?.id)||ids.has(p.id)||!Array.isArray(p.zonas_entrega)||
      !Array.isArray(p.catalogo_confirmado)||!Array.isArray(p.skus_confirmados)||
      p.skus_confirmados.length>200)
      throw new TypeError('identidad_proveedor_invalido');
    ids.add(p.id);
    const skus=new Set<string>();
    for(const s of p.skus_confirmados){
      if(s?.confirmado_por_proveedor!==true||!id(s.sku)||skus.has(s.sku)||
        !id(s.producto_id)||!esTexto(s.descripcion,300)||
        (s.marca!==null&&!esTexto(s.marca))||
        !bases.includes(s.unidad_base)||centi(s.contenido_por_envase)===null||
        typeof s.especificaciones_verificadas!=='boolean')
        throw new TypeError('identidad_sku_invalido');
      skus.add(s.sku);mapaAtributos(s.atributos_criticos,s.especificaciones_verificadas);
    }
  }
}
/**
 * La primera coincidencia es por IDENTIDAD del producto, no por marca o texto
 * del SKU. Lo técnico incompatible se EXCLUYE, lo desconocido se CONSULTA.
 */
export function planificarPorProducto(args:{
  solicitud:SolicitudAutomatica;
  borrador:BorradorDocumental;
  requisitos:readonly RequisitoPorProducto[];
  proveedores:readonly ProveedorPorProducto[];
}):PlanPorProducto{
  const {solicitud,borrador,requisitos,proveedores}=args;
  validar(solicitud,borrador,requisitos,proveedores);
  const reqs=new Map(requisitos.map(r=>[r.fila,r]));
  const duplicados=new Set<number>();
  for(const x of borrador.posibles_duplicados){
    duplicados.add(x.fila);duplicados.add(x.primeraFila);
  }
  const elegibles=proveedores.filter(p=>p.activo===true&&
    p.consentimiento_whatsapp===true&&p.opt_out===false&&
    p.zonas_entrega.some((z:string)=>zona(z)&&canon(z)===canon(solicitud.zona_entrega)));
  const solicitudes=new Map<string,ItemCotizable[]>();
  const retenidas:PlanPorProducto['retenidas']=[];
  for(const l of borrador.lineas){
    const req=reqs.get(l.fila);
    if(duplicados.has(l.fila)){retenidas.push({fila:l.fila,motivo:'duplicado'});continue;}
    if(!req||!validaLinea(l,req)){
      retenidas.push({fila:l.fila,motivo:'datos_inseguros'});continue;
    }
    let destinatarios=0;
    for(const p of elegibles){
      const opciones:OpcionCotizable[]=[];
      for(const sku of p.skus_confirmados){
        if(sku.producto_id!==req.producto_id||sku.rubro!==req.rubro||
          sku.unidad_base!==req.unidad_base)continue;
        // La marca es una variable libre salvo obligación explícita.
        if(l.marca_obligatoria&&(!esTexto(l.marca)||!esTexto(sku.marca)||
          canon(l.marca)!==canon(sku.marca)))continue;
        const dif=cotejarAtributos(mapaAtributos(req.atributos_criticos,false),
          mapaAtributos(sku.atributos_criticos,false));
        if(dif==='incompatible')continue;
        const esCompatible=dif==='compatible'&&req.especificaciones_verificadas&&
          sku.especificaciones_verificadas;
        const cantidad=centi(l.cantidad!),contenido=centi(req.contenido_por_unidad_pedida)!;
        const envase=centi(sku.contenido_por_envase)!;
        const requerido=(cantidad!*contenido)/100n;
        if(requerido<=0n||requerido>1000000000000n)continue;
        const envases=(requerido+envase-1n)/envase;
        if(envases<=0n||envases>1000000n)continue;
        const ofrecido=envases*envase;
        opciones.push({
          sku:sku.sku,descripcion:sku.descripcion,marca:sku.marca,
          clase:esCompatible?'producto_compatible':'consulta_especificacion',
          motivo:esCompatible?'Familia y atributos tecnicos confirmados; validar oferta':
            'Confirmar compatibilidad tecnica, ficha y uso antes de comparar',
          envases_a_cotizar:esCompatible?String(envases):null,
          unidad_venta:sku.unidad_venta,unidad_base:req.unidad_base,
          cantidad_requerida:decimal(requerido),
          cantidad_ofrecida:esCompatible?decimal(ofrecido):null,
          excedente:esCompatible?decimal(ofrecido-requerido):null,
          comparable_como_identico:false
        });
      }
      if(opciones.length){
        const items=solicitudes.get(p.id)??[];
        items.push({
          fila:l.fila,pedido_original:l.descripcion_original,
          producto_id:req.producto_id,
          marca_solicitada:l.marca,marca_obligatoria:l.marca_obligatoria,
          opciones
        });
        solicitudes.set(p.id,items);
        destinatarios++;
      }
    }
    if(destinatarios===0)retenidas.push({fila:l.fila,motivo:'sin_producto_compatible'});
  }
  return{
    estado:'plan_producto_primero_sin_envio',
    solicitudes:[...solicitudes.entries()].map(([proveedor_id,items])=>({
      proveedor_id,clave_idempotencia:solicitud.id+':producto:'+proveedor_id,items
    })),
    retenidas
  };
}
