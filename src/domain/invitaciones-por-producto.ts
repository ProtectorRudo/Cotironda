/**
 * D015: selección para INVITAR a cotizar por producto canónico.
 * Diferente de validar OFERTAS. Un SKU de la familia correcta justifica una
 * consulta aunque difiera marca/envase. Nunca se homologa una alternativa.
 * SOLO OFFLINE. Catálogos y producto_id deben provenir de backend curado.
 */
import type {BorradorDocumental, LineaDocumental} from './extraccion-documental.ts';
import type {SolicitudAutomatica} from './despacho-automatico.ts';
import type {Rubro} from './catalogo.ts';
import type {
  AtributoCritico, ProveedorPorProducto, SkuPorProducto, UnidadBase
} from './identidad-producto.ts';

export type RequisitoInvitacion = Readonly<{
  fila:number;
  descripcion_original:string;
  producto_id:string;
  rubro:Rubro;
  atributos_solicitados:readonly AtributoCritico[];
  // Null significa que NO se conoce tamaño de presentación solicitada.
  // Esto NO impide invitar a cotizar por producto.
  contenido_por_unidad_solicitada:string|null;
  unidad_base:UnidadBase|null;
}>;
export type OpcionInvitacion = Readonly<{
  sku:string;
  descripcion_catalogo:string;
  marca_catalogo:string|null;
  unidad_venta:string;
  contenido_por_envase:string;
  unidad_base:UnidadBase;
  relacion:'mismo_producto'|'verificar_especificacion'|'diferencia_tecnica_declarada';
  diferencias:readonly string[];
  cantidad_envases_orientativa:string|null;
  excedente_orientativo:string|null;
  cotizacion_requiere_confirmacion:true;
  comparable_como_identico:false;
}>;
export type InvitacionPorProducto = Readonly<{
  fila:number;
  pedido_original:string;
  producto_id:string;
  cantidad_pedida:string;
  unidad_pedida:string;
  marca_mencionada:string|null;
  marca_exclusiva:boolean;
  mensaje_proveedor:string;
  opciones:OpcionInvitacion[];
}>;
export type PlanInvitacionPorProducto = Readonly<{
  estado:'invitaciones_por_producto_sin_envio';
  invitaciones:{proveedor_id:string;clave_idempotencia:string;items:InvitacionPorProducto[]}[];
  retenidas:{fila:number;motivo:'linea_insegura'|'duplicado_dudoso'|'sin_proveedor_que_trabaje_producto'}[];
}>;

const canon=(s:string):string=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('es-AR').replace(/\s+/g,' ').trim();
const texto=(x:unknown,max=300):x is string=>typeof x==='string'&&
  x.trim().length>0&&x.length<=max&&!/[\u0000-\u001f]/.test(x);
const id=(x:unknown):x is string=>typeof x==='string'&&
  /^[a-z0-9][a-z0-9_-]{2,79}$/.test(x);
const zona=(x:unknown):x is string=>typeof x==='string'&&
  /^[A-Za-z0-9_-]{2,40}$/.test(x);
function centi(x:unknown):bigint|null{
  if(typeof x!=='string'||!/^\d{1,6}(?:[,.]\d{1,2})?$/.test(x))return null;
  const [i,f='']=x.replace(',','.').split('.');
  const n=100n*BigInt(i)+BigInt((f+'00').slice(0,2));
  return n>0n?n:null;
}
function decimal(n:bigint):string{
  const integer=n/100n,remainder=n%100n;
  return remainder===0n?String(integer):
    String(integer)+'.'+String(remainder).padStart(2,'0').replace(/0+$/,'');
}
function atributos(lista:readonly AtributoCritico[]):Map<string,string>{
  if(!Array.isArray(lista)||lista.length>24)throw new TypeError('atributos_invalidos');
  const found=new Map<string,string>();
  for(const a of lista){
    if(!id(a?.codigo)||!texto(a?.valor,120)||found.has(a.codigo))
      throw new TypeError('atributos_invalidos');
    found.set(a.codigo,canon(a.valor));
  }
  return found;
}
function lineaSegura(l:LineaDocumental,req:RequisitoInvitacion):boolean{
  return l.requiere_aclaracion.length===0 &&
    l.confianza_declarada!==null&&l.confianza_declarada>=0.95 &&
    l.producto_normalizado!==null &&
    canon(l.descripcion_original)===canon(l.producto_normalizado) &&
    canon(l.descripcion_original)===canon(req.descripcion_original) &&
    l.rubro===req.rubro && l.unidad!==null &&
    l.cantidad!==null&&centi(l.cantidad)!==null &&
    (!l.marca_obligatoria||texto(l.marca));
}
function validar(solicitud:SolicitudAutomatica,borrador:BorradorDocumental,
  requisitos:readonly RequisitoInvitacion[],proveedores:readonly ProveedorPorProducto[]):void {
  if(!id(solicitud?.id)||!zona(solicitud?.zona_entrega)||
    solicitud.envio_autorizado_por_comprador!==true)
    throw new TypeError('solicitud_sin_autorizacion');
  if(borrador?.estado!=='pendiente_despacho_automatico'||
    !Array.isArray(borrador.lineas)||borrador.lineas.length>100||
    !Array.isArray(borrador.posibles_duplicados)||
    !Array.isArray(requisitos)||requisitos.length>100||
    !Array.isArray(proveedores)||proveedores.length>1000)
    throw new TypeError('entrada_no_verificada');
  const filas=new Set<number>();
  for(const req of requisitos){
    if(!Number.isInteger(req?.fila)||req.fila<1||req.fila>100||
      filas.has(req.fila)||!id(req.producto_id)||!texto(req.descripcion_original)||
      !Array.isArray(req.atributos_solicitados)||
      (req.contenido_por_unidad_solicitada!==null&&centi(req.contenido_por_unidad_solicitada)===null)||
      (req.unidad_base!==null&&!['kg','l','unit','m','m2'].includes(req.unidad_base)))
      throw new TypeError('requisito_no_verificado');
    filas.add(req.fila);atributos(req.atributos_solicitados);
  }
  const ids=new Set<string>();
  for(const proveedor of proveedores){
    if(!id(proveedor?.id)||ids.has(proveedor.id)||
      !Array.isArray(proveedor.zonas_entrega)||
      !Array.isArray(proveedor.catalogo_confirmado)||
      !Array.isArray(proveedor.skus_confirmados)||proveedor.skus_confirmados.length>200)
      throw new TypeError('catalogo_no_verificado');
    ids.add(proveedor.id);
    const skus=new Set<string>();
    for(const sku of proveedor.skus_confirmados){
      if(sku?.confirmado_por_proveedor!==true||!id(sku.sku)||skus.has(sku.sku)||
        !id(sku.producto_id)||!texto(sku.descripcion)||
        (sku.marca!==null&&!texto(sku.marca,160))||
        !['kg','l','unit','m','m2'].includes(sku.unidad_base)||
        centi(sku.contenido_por_envase)===null||
        !Array.isArray(sku.atributos_criticos))
        throw new TypeError('sku_no_confirmado');
      skus.add(sku.sku);atributos(sku.atributos_criticos);
    }
  }
}
function evaluarSku(l:LineaDocumental,req:RequisitoInvitacion,sku:SkuPorProducto):
  OpcionInvitacion|null {
  if(sku.producto_id!==req.producto_id||sku.rubro!==req.rubro)return null;
  if(l.marca_obligatoria&&(!texto(l.marca)||!texto(sku.marca)||
    canon(l.marca)!==canon(sku.marca)))return null;
  const pedidos=atributos(req.atributos_solicitados);
  const declarados=atributos(sku.atributos_criticos);
  const diferencias=[...pedidos].filter(([codigo,v])=>
    declarados.has(codigo)&&declarados.get(codigo)!==v).map(([codigo])=>codigo);
  const pendientes=[...pedidos.keys()].filter(codigo=>!declarados.has(codigo));
  const mismabase=req.unidad_base!==null&&req.unidad_base===sku.unidad_base;
  const relacion:OpcionInvitacion['relacion']=diferencias.length?
    'diferencia_tecnica_declarada':
    pendientes.length||pedidos.size===0||!mismabase||!sku.especificaciones_verificadas?
      'verificar_especificacion':'mismo_producto';

  // Nunca sugerir cantidad para una opción con diferencia técnica conocida.
  // Tampoco completar un tamaño de bolsa que el comprador no indicó.
  let envases:string|null=null,excedente:string|null=null;
  if(relacion==='mismo_producto'&&req.contenido_por_unidad_solicitada!==null){
    const count=centi(l.cantidad!),porUnidad=centi(req.contenido_por_unidad_solicitada);
    const envase=centi(sku.contenido_por_envase);
    if(count!==null&&porUnidad!==null&&envase!==null){
      const requerido=count*porUnidad/100n;
      if(requerido>0n&&requerido<=1000000000000n){
        const entero=(requerido+envase-1n)/envase;
        if(entero>0n&&entero<=1000000n){
          envases=String(entero);excedente=decimal(entero*envase-requerido);
        }
      }
    }
  }
  return{
    sku:sku.sku,descripcion_catalogo:sku.descripcion,marca_catalogo:sku.marca,
    unidad_venta:sku.unidad_venta,contenido_por_envase:sku.contenido_por_envase,
    unidad_base:sku.unidad_base,relacion,diferencias,
    cantidad_envases_orientativa:envases,excedente_orientativo:excedente,
    cotizacion_requiere_confirmacion:true,comparable_como_identico:false
  };
}
/**
 * Invita por PRODUCTO CONFIRMADO, no por marca, presentación o coincidencia
 * técnica completa. Un conflicto explícito es visible, nunca homologado.
 */
export function planificarInvitacionesPorProducto(args:{
  solicitud:SolicitudAutomatica;
  borrador:BorradorDocumental;
  requisitos:readonly RequisitoInvitacion[];
  proveedores:readonly ProveedorPorProducto[];
}):PlanInvitacionPorProducto{
  const {solicitud,borrador,requisitos,proveedores}=args;
  validar(solicitud,borrador,requisitos,proveedores);
  const reqs=new Map(requisitos.map(x=>[x.fila,x]));
  const duplicates=new Set<number>();
  for(const d of borrador.posibles_duplicados){
    duplicates.add(d.fila);duplicates.add(d.primeraFila);
  }
  const elegibles=proveedores.filter(p=>p.activo===true&&
    p.consentimiento_whatsapp===true&&p.opt_out===false&&
    p.zonas_entrega.some((z:string)=>zona(z)&&canon(z)===canon(solicitud.zona_entrega)));
  const salidas=new Map<string,InvitacionPorProducto[]>();
  const retenidas:PlanInvitacionPorProducto['retenidas']=[];
  for(const linea of borrador.lineas){
    const req=reqs.get(linea.fila);
    if(duplicates.has(linea.fila)){
      retenidas.push({fila:linea.fila,motivo:'duplicado_dudoso'});continue;
    }
    if(!req||!lineaSegura(linea,req)){
      retenidas.push({fila:linea.fila,motivo:'linea_insegura'});continue;
    }
    let count=0;
    for(const proveedor of elegibles){
      const opciones=proveedor.skus_confirmados.map(s=>evaluarSku(linea,req,s))
        .filter((x):x is OpcionInvitacion=>x!==null);
      if(opciones.length===0)continue;
      const mensaje_proveedor='El comprador solicita: '+linea.descripcion_original+
        ', '+linea.cantidad+' '+linea.unidad+'. '+
        'Indicá qué producto de esta familia podés cotizar, marca, presentación, '+
        'cantidad y precio. Señalá cualquier diferencia técnica; '+
        'no presupongas que una alternativa cumple el pedido original.';
      const items=salidas.get(proveedor.id)??[];
      items.push({
        fila:linea.fila,pedido_original:linea.descripcion_original,
        producto_id:req.producto_id,cantidad_pedida:linea.cantidad!,
        unidad_pedida:linea.unidad!,
        marca_mencionada:linea.marca,marca_exclusiva:linea.marca_obligatoria,
        mensaje_proveedor,opciones
      });
      salidas.set(proveedor.id,items);
      count++;
    }
    if(count===0)retenidas.push({fila:linea.fila,motivo:'sin_proveedor_que_trabaje_producto'});
  }
  return{
    estado:'invitaciones_por_producto_sin_envio',
    invitaciones:[...salidas.entries()].map(([proveedor_id,items])=>({
      proveedor_id,clave_idempotencia:solicitud.id+':familia:'+proveedor_id,items
    })),
    retenidas
  };
}
