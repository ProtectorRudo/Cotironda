// Integración OFFLINE de los contratos de IA Central (etapas 1, 2 y 3).
// No usa API de IA, credenciales, base real ni WhatsApp. No acredita E2E de PILOTO.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluarLecturasSemanticasV1, validarRuteoSemanticoV1, asociarCotizacionV1
} from '../../src/domain/ia-central/contrato-v1.ts';
import {
  evaluarCotizacionMvp225, compararPorRubroMvp225
} from '../../src/domain/ia-central/calificador-cotizaciones-mvp225.ts';

const origen = 'Necesito 20 bolsas cemento CPC 50 kg, 3 bolsones arena y 2 latas pintura látex 20 L. Entrega La Plata.';
function item(evidencia, descripcion, cantidad, unidad, rubro) {
  const inicio = origen.indexOf(evidencia);
  assert.ok(inicio >= 0, evidencia);
  return {
    evidencia, inicio, fin: inicio + evidencia.length,
    descripcion, cantidad, unidad, rubro, presentacion: null, aclaracion: null
  };
}
const primera = {
  intencion: 'cotizar', zona_entrega: 'La Plata', dudas: [],
  articulos: [
    item('20 bolsas cemento CPC 50 kg', 'Cemento CPC 50 kg', '20', 'bag', 'obra_gruesa'),
    item('3 bolsones arena', 'Arena en bolsón', '3', 'm3', 'obra_gruesa'),
    item('2 latas pintura látex 20 L', 'Pintura látex 20 L', '2', 'unit', 'pintura')
  ]
};
const segunda = {
  integridad: 'completa', zona_entrega: 'La Plata',
  articulos: primera.articulos.map(
    ({evidencia, cantidad, unidad, rubro}) => ({evidencia, cantidad, unidad, rubro})
  )
};
const proveedores = [
  {key:'corralon_a', consentido:true, activo:true, zona:'La Plata', rubros:['obra_gruesa']},
  {key:'corralon_b', consentido:true, activo:true, zona:'La Plata', rubros:['obra_gruesa']},
  {key:'pintureria_c', consentido:true, activo:true, zona:'La Plata', rubros:['pintura']},
  {key:'sin_permiso', consentido:false, activo:true, zona:'La Plata', rubros:['obra_gruesa']}
];
const plan = [
  {proveedor:'corralon_a',articulos:[0,1]},
  {proveedor:'corralon_b',articulos:[0,1]},
  {proveedor:'pintureria_c',articulos:[2]}
];
const invitaciones = [
  {idRonda:'ronda_1',proveedor:'corralon_a',whapiId:'whapi-1',codigo:'COTI-1',vigente:true},
  {idRonda:'ronda_2',proveedor:'corralon_a',whapiId:'whapi-2',codigo:'COTI-2',vigente:true},
  {idRonda:'ronda_1',proveedor:'corralon_b',whapiId:'whapi-3',codigo:'COTI-1',vigente:true}
];
const pedido = [
  {id:'cemento_1', descripcion:'Cemento CPC 50 kg', rubro:'obra_gruesa', cantidad:'20', unidad:'bag'},
  {id:'arena_2', descripcion:'Arena en bolsón', rubro:'obra_gruesa', cantidad:'3', unidad:'m3'},
  {id:'pintura_3', descripcion:'Pintura látex 20 L', rubro:'pintura', cantidad:'2', unidad:'unit'}
];
const renglones = {
  cementoA: {
    numero:1, textoOriginal:'20 bolsas cemento CPC 50 kg AR$ 9.000 c/u total AR$ 180.000',
    descripcion:'Cemento CPC 50 kg', cantidad:'20', unidad:'bag',
    precioUnitarioLiteral:'AR$ 9.000', totalLineaLiteral:'AR$ 180.000', tipo:'material',
    articuloPedido:'cemento_1'
  },
  arenaA: {
    numero:2, textoOriginal:'3 bolsones arena AR$ 35.000 c/u total AR$ 105.000',
    descripcion:'Arena en bolsón', cantidad:'3', unidad:'m3',
    precioUnitarioLiteral:'AR$ 35.000', totalLineaLiteral:'AR$ 105.000', tipo:'material',
    articuloPedido:'arena_2'
  },
  cementoB: {
    numero:1, textoOriginal:'20 bolsas cemento CPC 50 kg AR$ 8.800 c/u total AR$ 176.000',
    descripcion:'Cemento CPC 50 kg', cantidad:'20', unidad:'bag',
    precioUnitarioLiteral:'AR$ 8.800', totalLineaLiteral:'AR$ 176.000', tipo:'material',
    articuloPedido:'cemento_1'
  },
  pinturaC: {
    numero:1, textoOriginal:'2 latas pintura látex 20 L AR$ 30.000 c/u total AR$ 60.000',
    descripcion:'Pintura látex 20 L', cantidad:'2', unidad:'unit',
    precioUnitarioLiteral:'AR$ 30.000', totalLineaLiteral:'AR$ 60.000', tipo:'material',
    articuloPedido:'pintura_3'
  }
};
function oferta(etiquetaAnonima, lineas) {
  return {
    etiquetaAnonima, moneda:'ARS', iva:'no_informado',
    flete:'no_informado', pago:'no_informado',
    fuente:'Moneda: ARS\n' + lineas.map(l => l.textoOriginal).join('\n'),
    lineas: lineas.map(({articuloPedido, ...l}) => l),
    vinculos: lineas.map(l => ({
      lineaOferta:l.numero, articuloPedido:l.articuloPedido,
      equivalencia:'misma_presentacion', explicacion:'Producto y presentación respaldados'
    }))
  };
}

test('1→2: pedido multirrubro con evidencia exacta y ruteo solo a destinatarios autorizados', () => {
  const lectura = evaluarLecturasSemanticasV1(origen, primera, segunda);
  assert.equal(lectura.estado, 'listo_para_preparar');
  assert.equal(lectura.pedido.articulos.length, 3);
  const ruta = validarRuteoSemanticoV1(lectura.pedido, proveedores, plan);
  assert.equal(ruta.estado, 'ruteo_verificado');
  assert.deepEqual(ruta.destinos.map(x => x.proveedor), plan.map(x => x.proveedor));
  assert.equal(
    validarRuteoSemanticoV1(lectura.pedido, proveedores,
      [{proveedor:'sin_permiso', articulos:[0]}]).estado,
    'requiere_revision'
  );
  assert.equal(
    validarRuteoSemanticoV1(lectura.pedido, proveedores,
      [{proveedor:'pintureria_c', articulos:[0]}]).estado,
    'requiere_revision'
  );
});

test('1→2: dos rondas simultáneas nunca se asignan por intuición del modelo', () => {
  const args = {
    proveedor:'corralon_a', respuestaAWhapiId:null,
    codigoRonda:null, invitaciones
  };
  assert.deepEqual(asociarCotizacionV1(args), {estado:'ambigua', idRonda:null});
  assert.deepEqual(
    asociarCotizacionV1({...args, respuestaAWhapiId:'whapi-2'}),
    {estado:'asociada', idRonda:'ronda_2'}
  );
  assert.deepEqual(
    asociarCotizacionV1({...args, respuestaAWhapiId:'whapi-3'}),
    {estado:'sin_ronda', idRonda:null}
  );
  assert.deepEqual(
    asociarCotizacionV1({...args, codigoRonda:'COTI-1'}),
    {estado:'asociada', idRonda:'ronda_1'}
  );
});

test('2→3: ofertas parciales conservadas, dinero respaldado y comparación por artículo', () => {
  const a = oferta('Oferta A', [renglones.cementoA, renglones.arenaA]);
  const b = oferta('Oferta B', [renglones.cementoB]);
  const c = oferta('Oferta C', [renglones.pinturaC]);
  const comparacion = compararPorRubroMvp225(pedido, [a, b, c]);
  assert.deepEqual(comparacion.ofertas.map(x => x.estado),
    ['verificada_para_comparacion','verificada_para_comparacion','verificada_para_comparacion']);
  assert.equal(comparacion.ofertas[1].rubros[0].cobertura, 'parcial');
  assert.deepEqual(comparacion.ofertas[1].rubros[0].faltantes, ['arena_2']);
  assert.equal(comparacion.comparables[0].situacion, 'importe_linea_comparable');
  assert.deepEqual(
    comparacion.comparables[0].alternativas.map(x => [x.oferta, x.centavos]),
    [['Oferta B', 17600000n], ['Oferta A', 18000000n]]
  );
  assert.equal(comparacion.comparables[1].situacion, 'sin_base_suficiente');
  assert.equal(comparacion.comparables[2].situacion, 'sin_base_suficiente');
  assert.equal(comparacion.rankingGlobalPermitido, false);
  assert.equal(comparacion.adjudicacionAutomatica, false);
  assert.equal(comparacion.contactosRevelados, false);
});

test('2→3: importe alterado o cargo de flete impide dar precio comparable por supuesto', () => {
  const a = oferta('Oferta A', [renglones.cementoA, renglones.arenaA]);
  const altered = structuredClone(a);
  altered.lineas[0].precioUnitarioLiteral = 'AR$ 7.000';
  assert.equal(evaluarCotizacionMvp225(pedido, altered).estado, 'requiere_revision');
  const extra = {
    numero:3, textoOriginal:'Flete AR$ 12.000', descripcion:'Flete',
    cantidad:null, unidad:null, precioUnitarioLiteral:null,
    totalLineaLiteral:'AR$ 12.000', tipo:'cargo_adicional'
  };
  const withExtra = {...a, fuente:a.fuente+'\n'+extra.textoOriginal,
    lineas:[...a.lineas, extra]};
  const evaluated = evaluarCotizacionMvp225(pedido, withExtra);
  assert.equal(evaluated.estado, 'requiere_revision');
  assert.ok(evaluated.motivos.includes('cargos_adicionales_sin_comparacion'));
  assert.equal(compararPorRubroMvp225(pedido,[withExtra,oferta('Oferta B',[renglones.cementoB])])
    .comparables[0].situacion, 'sin_base_suficiente');
});
