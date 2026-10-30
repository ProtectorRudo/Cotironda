import {crearXlsxFixture} from '../../tests/helpers/xlsx-fixture.mjs';
import {simularDespachoDesdeXlsx} from '../offline/xlsx-seguro.mjs';

// Archivo XLSX auténtico generado en RAM con materiales y comercios FICTICIOS.
const xlsx=crearXlsxFixture({hojas:[[
  ['Cantidad','Unidad','Material'],
  ['20','bolsas','Cemento CPC 50 kg'],
  ['3','unidades','Pintura látex interior 20 l'],
  ['15','unidades','Placa yeso 12,5 mm'],
  ['1.000','bolsas','Cemento CPC 50 kg'],
  ['7','bolsas','Material fuera de catálogo']
]]});
const articulo=(descripcion,unidad,rubro)=>({descripcion,unidad,rubro,marca:null});
const prov=(id,producto)=>({
  id,activo:true,consentimiento_whatsapp:true,opt_out:false,
  zonas_entrega:['la_plata'],catalogo_confirmado:[producto]
});
const resultado=simularDespachoDesdeXlsx(xlsx,{
  id:'ronda_xlsx_demo_001',zona_entrega:'la_plata',envio_autorizado_por_comprador:true
},[
  prov('corralon_demo',articulo('Cemento CPC 50 kg','bag','corralon')),
  prov('pinturer_demo',articulo('Pintura látex interior 20 l','unit','pintureria')),
  prov('durlock_demo',articulo('Placa yeso 12,5 mm','unit','construccion_seco'))
]);
console.log(JSON.stringify({
  simulacion:true,origen:'XLSX ZIP+OpenXML',sin_whatsapp_real:true,
  resumen:resultado.resumen,
  solicitudes:resultado.plan.solicitudes.map(x=>({
    proveedor:x.proveedor_id,clave:x.clave_idempotencia,
    articulos:x.items.map(i=>({ubicacion:i.ubicacion,descripcion:i.descripcion,cantidad:i.cantidad,unidad:i.unidad}))
  })),
  lineas_retenidas:resultado.plan.retenidas,
  sin_catalogo:resultado.lineas_sin_catalogo,
  filas_incompletas:resultado.filas_incompletas
},null,2));
