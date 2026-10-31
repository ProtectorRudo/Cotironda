/**
 * MVP-005: presentation-only interpretation of economic details explicitly
 * present in the provider offer model. NEVER infer IVA/freight when absent.
 * The real WhatsApp/AI adapter must obtain confirmed gross/net basis BEFORE
 * creating a precioUnitarioNeto and calling the deterministic comparator.
 */
import type {OfertaComparable} from './comparacion-ofertas.ts';

type Estado='informado'|'pendiente';
export type AclaracionEconomica=Readonly<{
  estado:Estado;
  texto:string;
}>;
export type DetalleEconomicoOferta=Readonly<{
  ivaPorLinea:readonly Readonly<{
    itemId:string;
    precioBase:AclaracionEconomica;
    iva:AclaracionEconomica;
  }>[];
  flete:AclaracionEconomica;
  tienePendientes:boolean;
}>;
const status=(texto:string,estado:Estado='informado'):AclaracionEconomica=>Object.freeze({estado,texto});
export function detalleEconomicoExplicito(oferta:OfertaComparable):DetalleEconomicoOferta{
  const ivaPorLinea=oferta.items.map(linea=>{
    const precioBase=linea.precioUnitarioNeto===null
      ?status('Precio base sin aclarar; solicitar confirmación al proveedor.','pendiente')
      :status('Precio unitario base declarado: '+linea.precioUnitarioNeto+' '+oferta.moneda+'.');
    const iva=linea.ivaPorcentaje===null
      ?status('IVA: sin aclarar; no se presupone incluido, excluido ni tasa 0%.','pendiente')
      :status('IVA: base más '+linea.ivaPorcentaje+'% declarado para esta línea.');
    return Object.freeze({itemId:linea.itemId,precioBase,iva});
  });
  const flete=oferta.fleteFinal===null
    ?status('Flete: sin aclarar; no se supone incluido ni gratuito.','pendiente')
    :status('Flete declarado para esta cotización: '+oferta.fleteFinal+' '+oferta.moneda+'.');
  return Object.freeze({
    ivaPorLinea:Object.freeze(ivaPorLinea),
    flete,
    tienePendientes:flete.estado==='pendiente'||ivaPorLinea.some(x=>
      x.iva.estado==='pendiente'||x.precioBase.estado==='pendiente')
  });
}
