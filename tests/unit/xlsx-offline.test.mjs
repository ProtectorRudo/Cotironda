import test from 'node:test';
import assert from 'node:assert/strict';
import {extraerTablaXlsx,simularDespachoDesdeXlsx} from '../../scripts/offline/xlsx-seguro.mjs';
import {crearXlsxFixture,armarZip} from '../helpers/xlsx-fixture.mjs';

const solicitud={id:'ronda_xlsx_0001',zona_entrega:'la_plata',envio_autorizado_por_comprador:true};
const proveedor=(id,descripcion,unidad,rubro,extra={})=>({
  id,activo:true,consentimiento_whatsapp:true,opt_out:false,
  zonas_entrega:['la_plata'],
  catalogo_confirmado:[{descripcion,unidad,rubro,marca:null}],...extra
});
const proveedores=[
  proveedor('corralon_001','Cemento CPC 50 kg','bag','corralon'),
  proveedor('pinturer_001','Pintura látex interior 20 l','unit','pintureria'),
  proveedor('durlock_0001','Placa yeso 12,5 mm','unit','construccion_seco')
];
const leer=(fixture,ps=proveedores,s=solicitud)=>simularDespachoDesdeXlsx(fixture,s,ps);

test('archivo XLSX auténtico produce 3 planes separados con fuente hoja/fila',()=>{
  const r=leer(crearXlsxFixture());
  assert.equal(r.formato,'xlsx');
  assert.equal(r.estado,'simulacion_sin_envio');
  assert.deepEqual(r.resumen,{
    lineas_recibidas:3,lineas_preparadas:3,lineas_retenidas:0,proveedores_preparados:3
  });
  assert.deepEqual(r.plan.solicitudes.map(p=>[p.proveedor_id,p.items[0].ubicacion]),[
    ['corralon_001','Hoja 1, fila 2'],
    ['pinturer_001','Hoja 1, fila 3'],
    ['durlock_0001','Hoja 1, fila 4']
  ]);
  assert.equal(r.plan.solicitudes[0].items[0].cantidad,'20');
});
test('sharedStrings de Excel se leen y conservan referencias',()=>{
  const r=leer(crearXlsxFixture({sharedStrings:true}));
  assert.equal(r.resumen.lineas_preparadas,3);
  assert.equal(r.borrador.lineas[1].ubicacion,'Hoja 1, fila 3');
});
test('dos hojas con encabezados válidos y orden de columnas intercambiado',()=>{
  const r=leer(crearXlsxFixture({hojas:[
    [['Cantidad','Unidad','Material'],['20','bolsas','Cemento CPC 50 kg']],
    [['Producto','Cantidad','Unidad'],['Pintura látex interior 20 l','3','unidades']]
  ]}));
  assert.equal(r.resumen.lineas_recibidas,2);
  assert.equal(r.resumen.lineas_preparadas,2);
  assert.deepEqual(r.plan.solicitudes.map(x=>x.items[0].ubicacion),[
    'Hoja 1, fila 2','Hoja 2, fila 2'
  ]);
});
test('columna o cantidad faltante queda como línea retenida, no se descarta',()=>{
  const r=leer(crearXlsxFixture({hojas:[[
    ['Cantidad','Unidad','Material'],[null,'bolsas','Cemento CPC 50 kg'],
    ['3','unidades','Pintura látex interior 20 l']
  ]]}));
  assert.equal(r.resumen.lineas_recibidas,2);
  assert.equal(r.resumen.lineas_preparadas,1);
  assert.equal(r.resumen.lineas_retenidas,1);
  assert.deepEqual(r.filas_incompletas,['Hoja 1, fila 2']);
});
test('material de 25 kg nunca se manda como 50 kg',()=>{
  const r=leer(crearXlsxFixture({hojas:[[
    ['Cantidad','Unidad','Material'],
    ['20','bolsas','Cemento CPC 25 kg'],
    ['3','unidades','Pintura látex interior 20 l']
  ]]}));
  assert.deepEqual(r.plan.solicitudes.map(x=>x.proveedor_id),['pinturer_001']);
  assert.deepEqual(r.lineas_sin_catalogo,[1]);
});
test('cantidad 1.000 ambigua queda retenida, otros materiales avanzan',()=>{
  const r=leer(crearXlsxFixture({hojas:[[
    ['Cantidad','Unidad','Material'],['1.000','bolsas','Cemento CPC 50 kg'],
    ['3','unidades','Pintura látex interior 20 l']
  ]]}));
  assert.equal(r.resumen.lineas_preparadas,1);
  assert.equal(r.resumen.lineas_retenidas,1);
});
test('excel con fórmula no puede enviar valores calculados',()=>{
  assert.throws(()=>leer(crearXlsxFixture({formula:true})),/xlsx_formula_no_admitida/);
});
test('rechaza macros y partes embebidas',()=>{
  assert.throws(()=>leer(crearXlsxFixture({extra:{'xl/vbaProject.bin':'dummy'}})),/xlsx_contenido_activo/);
  assert.throws(()=>leer(crearXlsxFixture({extra:{'xl/externalLinks/externalLink1.xml':'x'}})),/xlsx_contenido_activo/);
});
test('relaciones externas rechazadas antes de interpretar datos',()=>{
  const x=crearXlsxFixture({extra:{
    'xl/_rels/workbook.xml.rels':'<Relationships><Relationship TargetMode="External" Target="https://malicioso.example"/></Relationships>'
  }});
  assert.throws(()=>leer(x),/xlsx_xml_externo/);
});
test('XML con DOCTYPE y ENTITY rechazado',()=>{
  const x=crearXlsxFixture({extra:{
    'xl/_rels/workbook.xml.rels':'<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><Relationships/>'
  }});
  assert.throws(()=>leer(x),/xlsx_xml_externo/);
});
test('rechaza ZIP falso, truncado y nombre peligroso en central directory',()=>{
  assert.throws(()=>leer(Buffer.from('%PDF-1.7')),/xlsx_tamano_archivo|xlsx_zip_sin_indice/);
  const valid=crearXlsxFixture();
  assert.throws(()=>leer(valid.subarray(0,valid.length-7)),/xlsx_zip_sin_indice/);
  const ruta=crearXlsxFixture({extra:{'../escape.txt':'contenido'}});
  assert.throws(()=>leer(ruta),/xlsx_zip_ruta_o_duplicado/);
});
test('ZIP con CRC corrupto se rechaza',()=>{
  const x=Buffer.from(crearXlsxFixture());
  const inicio=x.indexOf(Buffer.from('xl/workbook.xml'));
  assert.ok(inicio>0);
  const data=inicio+'xl/workbook.xml'.length;
  x[data+3]^=0xff;
  assert.throws(()=>leer(x),/xlsx_zip_integridad|xlsx_descompresion_invalida/);
});
test('evita ZIP bomb antes de descomprimir',()=>{
  const grandote='A'.repeat(1500000);
  const x=crearXlsxFixture({extra:{'xl/styles.xml':grandote}});
  assert.throws(()=>leer(x),/xlsx_zip_limites/);
});
test('no acepta encabezados inventados ni columnas con datos que se perderían',()=>{
  const x=crearXlsxFixture({hojas:[[['Precio','Unidad','Material'],['20','bolsas','Cemento CPC 50 kg']]]});
  assert.throws(()=>leer(x),/xlsx_encabezado_incompatible/);
  // La prueba de columna D usa una hoja sintética con 4 celdas explícitas.
  const cuatro=crearXlsxFixture({hojas:[[ ['Cantidad','Unidad','Material','Precio'],
    ['20','bolsas','Cemento CPC 50 kg','$10'] ]]});
  assert.throws(()=>leer(cuatro),/xlsx_columnas_extra/);
});
test('rechaza más de 100 artículos, pero acepta 100 cuando catálogo coincide',()=>{
  const productos=Array.from({length:100},(_,i)=>'Producto sintético '+i);
  const p={
    id:'catalogo_100',activo:true,consentimiento_whatsapp:true,opt_out:false,
    zonas_entrega:['la_plata'],catalogo_confirmado:productos.map(descripcion=>({
      descripcion,unidad:'unit',rubro:'corralon',marca:null
    }))
  };
  const rows=[['Cantidad','Unidad','Material'],...productos.map(s=>['2','unidades',s])];
  const r=leer(crearXlsxFixture({hojas:[rows]}),[p]);
  assert.equal(r.resumen.lineas_preparadas,100);
  assert.equal(r.plan.solicitudes[0].items.length,100);
  assert.throws(()=>leer(crearXlsxFixture({hojas:[[...rows,['2','unidades','Producto 101']]]}),[p]),
    /xlsx_demasiadas_filas/);
});
test('archivo y autorización no pueden convertirse en envío no autorizado',()=>{
  assert.throws(()=>leer(crearXlsxFixture(),proveedores,{
    ...solicitud,envio_autorizado_por_comprador:false
  }),/solicitud_sin_autorizacion/);
});
test('rechaza muchos archivos dentro del ZIP y número de hojas excesivo',()=>{
  const extra=Object.fromEntries(Array.from({length:60},(_,i)=>['xl/custom/a'+i+'.xml','<xml/>']));
  assert.throws(()=>leer(crearXlsxFixture({extra})),/xlsx_indice_invalido/);
  const sheets=Array.from({length:4},()=>[['Cantidad','Unidad','Material'],['1','bolsas','Cemento CPC 50 kg']]);
  assert.throws(()=>leer(crearXlsxFixture({hojas:sheets})),/xlsx_hojas_no_admitidas/);
});
test('sin catálogo confirmado no entrega a nadie',()=>{
  const r=leer(crearXlsxFixture(),[]);
  assert.equal(r.plan.solicitudes.length,0);
  assert.deepEqual(r.lineas_sin_catalogo,[1,2,3]);
});
