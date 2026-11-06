/**
 * MVP254 — suite de contrato OFFLINE (NO mide precisión de un modelo real).
 * 56 materiales variados x 4 formulaciones = 224 pedidos distintos;
 * 56 x 2 negativas = 112 casos de discrepancia/riesgo.
 * El oráculo semántico es una fixture controlada: NO enviar WhatsApps ni
 * contar estas pruebas como inferencias reales de la API.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
 evaluarLecturasSemanticasV1, localizarEvidenciasV1,
 validarRuteoSemanticoV1, asociarCotizacionV1
} from '../../src/domain/ia-central/contrato-v1.ts';

const samples = [
 // Obra gruesa (8)
 ['cemento CPC 50kg','bag','obra_gruesa','20','bolsas'],
 ['arena a granel','m3','obra_gruesa','3','m³ de'],
 ['bolsón de piedra','m3','obra_gruesa','2','m³ de'],
 ['ladrillo hueco 12x18x33','unit','obra_gruesa','250','unidades de'],
 ['hierro ADN 420 8mm','unit','obra_gruesa','12','varillas de'],
 ['cal hidratada 25 kg','bag','obra_gruesa','8','bolsas de'],
 ['malla electrosoldada','unit','obra_gruesa','6','paños de'],
 ['ceresita hidrogrugo','unit','obra_gruesa','4','bidones de'],
 // Pintura (8)
 ['látex blanco interior 20 l','unit','pintura','3','latas de'],
 ['Sinteplast exterior 10 l','unit','pintura','4','latas de'],
 ['esmalte sintético brillante','unit','pintura','2','envases de'],
 ['enduido plástico','bag','pintura','5','bolsas de'],
 ['fijador sellador al agua','unit','pintura','2','bidones de'],
 ['pincel número 20','unit','pintura','6','pinceles de'],
 ['rodillo pelo largo 22 cm','unit','pintura','7','rodillos de'],
 ['diluyente para esmalte 4 litros','unit','pintura','8','botellas de'],
 // Electricidad (8)
 ['cable unipolar 2,5 mm²','m','electricidad','100','metros de'],
 ['térmica bipolar 20A','unit','electricidad','3','unidades de'],
 ['disyuntor diferencial 40A','unit','electricidad','2','unidades de'],
 ['caja octogonal grande','unit','electricidad','25','unidades de'],
 ['caño corrugado 3/4','m','electricidad','75','metros de'],
 ['tomacorriente doble Cambre','unit','electricidad','10','unidades de'],
 ['tablero modular DIN 12 bocas','unit','electricidad','4','unidades de'],
 ['llave interruptora Schneider','unit','electricidad','5','unidades de'],
 // Construcción en seco (8)
 ['placa durlock 12,5mm','unit','construccion_seca','25','placas de'],
 ['perfil montante 70','unit','construccion_seca','20','perfiles de'],
 ['perfil solera 70','unit','construccion_seca','18','perfiles de'],
 ['masilla de juntas balde 25kg','unit','construccion_seca','4','baldes de'],
 ['cinta de papel para junta','roll','construccion_seca','5','rollos de'],
 ['lana de vidrio 50mm','m2','construccion_seca','40','m² de'],
 ['placa verde antihumedad','unit','construccion_seca','12','placas de'],
 ['tornillo T2 para placas','box','construccion_seca','8','cajas de'],
 // Sanitarios (8)
 ['caño termofusión 20mm','m','sanitarios','30','metros de'],
 ['codo PVC 110','unit','sanitarios','10','unidades de'],
 ['inodoro largo blanco','unit','sanitarios','2','unidades de'],
 ['bidet de tres agujeros','unit','sanitarios','3','unidades de'],
 ['grifería FV lavatorio','unit','sanitarios','2','unidades de'],
 ['llave esférica 3/4','unit','sanitarios','5','unidades de'],
 ['tanque de agua 1000 litros','unit','sanitarios','2','unidades de'],
 ['flexible mallado 40cm','unit','sanitarios','15','unidades de'],
 // Ferretería (8)
 ['tarugo 8mm','box','ferreteria','2','cajas de'],
 ['clavo punta París 2 pulgadas','kg','ferreteria','10','kg de'],
 ['alambre recocido','kg','ferreteria','3','kg de'],
 ['silicona neutra','unit','ferreteria','6','cartuchos de'],
 ['adhesivo de montaje','unit','ferreteria','4','tubos de'],
 ['tornillo autoperforante','box','ferreteria','3','cajas de'],
 ['cinta aisladora 20m','unit','ferreteria','15','unidades de'],
 ['disco corte 115mm','unit','ferreteria','7','unidades de'],
 // Otros (8)
 ['geomembrana protectora','m2','otros','25','m² de'],
 ['red de seguridad naranja','m','otros','60','metros de'],
 ['estacas de madera','unit','otros','20','unidades de'],
 ['malla media sombra','m2','otros','35','m² de'],
 ['placa de policarbonato alveolar','unit','otros','5','placas de'],
 ['tanque plástico auxiliar','unit','otros','2','unidades de'],
 ['baldes para escombro','unit','otros','8','unidades de'],
 ['film stretch transparente','roll','otros','12','rollos de']
];
assert.equal(samples.length,56);
const variants=[
 ['Necesito ',' para la obra. Entrega en La Plata.'],
 ['Hola, porfa cotizame ','; llevámelo a La Plata.'],
 ['Pedido urgente: ',' (descarga La Plata).'],
 ['Buen día, ¿precio de ','? Es para entregar en La Plata.']
];
function make(seed,variant){
 const [name,unit,rubro,quantity,spoken]=seed;
 const evidence=quantity+' '+spoken+name;
 const [prefix,suffix]=variants[variant];
 const source=prefix+evidence+suffix;
 const proposed={
  intencion:'cotizar',zona_entrega:'La Plata',
  articulos:[{evidencia:evidence,descripcion:name,cantidad:quantity,
   unidad:unit,rubro,presentacion:null,aclaracion:null}],dudas:[]
 };
 const first=localizarEvidenciasV1(source,proposed);
 assert.ok(first);
 const second={
  integridad:'completa',zona_entrega:'La Plata',
  articulos:[{evidencia:evidence,cantidad:quantity,unidad:unit,rubro}]
 };
 return {source,first,second};
}
for(const [index,seed] of samples.entries()){
 for(let i=0;i<4;i++){
  test('corpus123 / pedido '+index+' / formulación '+i+' tiene evidencia exacta',()=>{
   const {source,first,second}=make(seed,i);
   const actual=evaluarLecturasSemanticasV1(source,first,second);
   assert.equal(actual.estado,'listo_para_preparar',source);
   assert.equal(actual.pedido.articulos.length,1);
   assert.equal(actual.pedido.articulos[0].rubro,seed[2]);
   assert.equal(actual.pedido.articulos[0].cantidad,seed[3]);
  });
 }
 test('corpus123 / cantidad discrepante '+index+' requiere aclaración',()=>{
  const {source,first,second}=make(seed,0);
  const changed={...second,articulos:[{...second.articulos[0],
   cantidad:String(Number(seed[3])+1)}]};
  const result=evaluarLecturasSemanticasV1(source,first,changed);
  assert.equal(result.estado,'requiere_aclaracion');
  assert.equal(result.pedido,null);
 });
 test('corpus123 / cita desplazada '+index+' se rechaza',()=>{
  const {source,first,second}=make(seed,1);
  const changed={...first,articulos:[{...first.articulos[0],
   inicio:first.articulos[0].inicio+1,
   fin:first.articulos[0].fin+1}]};
  const result=evaluarLecturasSemanticasV1(source,changed,second);
  assert.equal(result.estado,'rechazado');
  assert.equal(result.pedido,null);
 });
}
test('corpus123 / sin zona no abre ronda ni invita',()=>{
 const {source,first,second}=make(samples[0],2);
 const r=evaluarLecturasSemanticasV1(source,{...first,zona_entrega:null},
  {...second,zona_entrega:null});
 assert.equal(r.estado,'requiere_aclaracion');
 assert.equal(r.motivo,'zona_de_entrega_faltante');
});
test('corpus123 / proveedor fuera de zona o sin consentimiento no recibe nada',()=>{
 const {source,first,second}=make(samples[2],0);
 const result=evaluarLecturasSemanticasV1(source,first,second);
 assert.equal(result.estado,'listo_para_preparar');
 const providers=[
  {key:'proveedor_1',consentido:true,activo:true,zona:'La Plata',rubros:['obra_gruesa']},
  {key:'proveedor_2',consentido:false,activo:true,zona:'La Plata',rubros:['obra_gruesa']},
  {key:'proveedor_3',consentido:true,activo:true,zona:'Berisso',rubros:['obra_gruesa']},
  {key:'proveedor_4',consentido:true,activo:true,zona:'La Plata',rubros:['pintura']}
 ];
 assert.equal(validarRuteoSemanticoV1(result.pedido,providers,
  [{proveedor:'proveedor_1',articulos:[0]}]).estado,'ruteo_verificado');
 for(const proveedor of providers.slice(1)){
  assert.equal(validarRuteoSemanticoV1(result.pedido,providers,
   [{proveedor:proveedor.key,articulos:[0]}]).estado,'requiere_revision');
 }
});
test('corpus123 / dos rondas del mismo proveedor sin cita nunca se mezclan',()=>{
 const invitations=[
  {idRonda:'ronda_a',proveedor:'proveedor_1',whapiId:'message_a',codigo:'A1',vigente:true},
  {idRonda:'ronda_b',proveedor:'proveedor_1',whapiId:'message_b',codigo:'B2',vigente:true},
  {idRonda:'ronda_c',proveedor:'proveedor_2',whapiId:'message_c',codigo:'C3',vigente:true}
 ];
 const base={proveedor:'proveedor_1',respuestaAWhapiId:null,codigoRonda:null,
  invitaciones:invitations};
 assert.deepEqual(asociarCotizacionV1(base),{estado:'ambigua',idRonda:null});
 assert.deepEqual(asociarCotizacionV1({...base,respuestaAWhapiId:'message_b'}),
  {estado:'asociada',idRonda:'ronda_b'});
 assert.deepEqual(asociarCotizacionV1({...base,respuestaAWhapiId:'message_c'}),
  {estado:'sin_ronda',idRonda:null});
 assert.deepEqual(asociarCotizacionV1({...base,codigoRonda:'A1'}),
  {estado:'asociada',idRonda:'ronda_a'});
 assert.deepEqual(asociarCotizacionV1({...base,codigoRonda:'C3'}),
  {estado:'sin_ronda',idRonda:null});
 assert.deepEqual(asociarCotizacionV1({...base,respuestaAWhapiId:'message_a',
  invitaciones:[...invitations,{...invitations[0]}]}),
  {estado:'ambigua',idRonda:null});
});


test('corpus123 / 3 rubros, 6 proveedores y cero destinatarios ajenos',()=>{
 const evidence=[
  '20 bolsas cemento CPC 50kg',
  '5 latas látex interior 20 L',
  '80 metros cable 2,5 mm'
 ];
 const src='Cotizame '+evidence.join(' y ')+' para entregar en La Plata';
 const items=evidence.map((e,i)=>({
  evidencia:e,descripcion:['Cemento CPC 50 kg','Látex interior','Cable 2,5 mm'][i],
  cantidad:['20','5','80'][i],unidad:['bag','unit','m'][i],
  rubro:['obra_gruesa','pintura','electricidad'][i],
  presentacion:null,aclaracion:null
 }));
 const first=localizarEvidenciasV1(src,{intencion:'cotizar',
  zona_entrega:'La Plata',articulos:items,dudas:[]});
 const second={integridad:'completa',zona_entrega:'La Plata',
  articulos:items.map(x=>({evidencia:x.evidencia,cantidad:x.cantidad,
   unidad:x.unidad,rubro:x.rubro}))};
 const result=evaluarLecturasSemanticasV1(src,first,second);
 assert.equal(result.estado,'listo_para_preparar');
 const providers=Array.from({length:6},(_,i)=>({
  key:'proveedor_'+(i+1),consentido:true,activo:true,zona:'La Plata',
  rubros:[['obra_gruesa','pintura','electricidad'][Math.floor(i/2)]]
 }));
 const selection=providers.map((p,i)=>({
  proveedor:p.key,articulos:[Math.floor(i/2)]
 }));
 const route=validarRuteoSemanticoV1(result.pedido,providers,selection);
 assert.equal(route.estado,'ruteo_verificado');
 assert.equal(route.destinos.length,6);
 const wrong=selection.map((x,i)=>i===5?{...x,articulos:[0]}:x);
 assert.equal(validarRuteoSemanticoV1(result.pedido,providers,wrong)
  .estado,'requiere_revision');
 assert.equal(validarRuteoSemanticoV1(result.pedido,providers,
  [...selection,{proveedor:'proveedor_siete',articulos:[2]}])
  .estado,'requiere_revision');
});
