import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, evaluarProveedor } from '../../src/domain/elegibilidad.ts';

const p = {
  organizationId: 'org-ejemplo', habilitado: true,
  aceptaSolicitudes: true, consentimientoWhatsApp: true,
  codigosConfirmados: ['CEMENTO-50', 'PLACA-12'],
  zonasEntrega: [{provincia:'Buenos Aires', ciudad:'La Plata'}]
};
const destino={provincia:'BUENOS AIRES',ciudad:' La Plata '};
const lista=[{codigo:'cemento-50',cantidad:20},{codigo:'PINTURA-20',cantidad:3}];

test('normaliza acentos y espacios',()=>{
  assert.equal(normalizar('  Cañería '),'caneria');
});
test('permite oferta parcial cuando coinciden productos',()=>{
  assert.deepEqual(evaluarProveedor(p,destino,lista), {
    elegible:true,motivo:'ok',codigosCoincidentes:['cemento-50']
  });
});
test('sin consentimiento no invita',()=>{
  assert.equal(evaluarProveedor({...p,consentimientoWhatsApp:false},destino,lista).motivo,'sin_consentimiento');
});
test('no invita fuera de zona',()=>{
  assert.equal(evaluarProveedor(p,{provincia:'Buenos Aires',ciudad:'Tandil'},lista).motivo,'fuera_de_zona');
});
test('categoria general sin catalogo no basta',()=>{
  assert.equal(evaluarProveedor({...p,codigosConfirmados:[]},destino,lista).elegible,false);
});
test('cantidad cero no es un producto cotizable',()=>{
  assert.equal(evaluarProveedor(p,destino,[{codigo:'cemento-50',cantidad:0}]).elegible,false);
});
test('codigos duplicados solo generan una coincidencia',()=>{
  assert.equal(evaluarProveedor(p,destino,[{codigo:'cemento-50',cantidad:1},{codigo:'CEMENTO-50',cantidad:3}]).codigosCoincidentes.length,1);
});
test('proveedor inactivo no participa',()=>{
  assert.equal(evaluarProveedor({...p,habilitado:false},destino,lista).motivo,'inactivo');
});
test('destino vacio no habilita invitacion',()=>{
  assert.equal(evaluarProveedor(p,{provincia:'',ciudad:''},lista).elegible,false);
});
