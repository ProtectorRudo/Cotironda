import test from 'node:test';
import assert from 'node:assert/strict';
import { puedeGestionarCatalogo } from '../../src/domain/autorizacion.ts';
const m={userId:'user-a',organizationId:'org-a',role:'manager',status:'active'};
test('manager activo puede editar su empresa',()=>assert.equal(puedeGestionarCatalogo('user-a','org-a',m,'editar'),true));
test('owner activo puede editar su empresa',()=>assert.equal(puedeGestionarCatalogo('user-a','org-a',{...m,role:'owner'},'editar'),true));
test('miembro solo puede leer',()=>{
  const member={...m,role:'member'};
  assert.equal(puedeGestionarCatalogo('user-a','org-a',member,'leer'),true);
  assert.equal(puedeGestionarCatalogo('user-a','org-a',member,'editar'),false);
});
test('separación entre empresas',()=>assert.equal(puedeGestionarCatalogo('user-a','org-b',m,'editar'),false));
test('separación entre usuarios',()=>assert.equal(puedeGestionarCatalogo('user-b','org-a',m,'leer'),false));
test('suspendido no accede',()=>assert.equal(puedeGestionarCatalogo('user-a','org-a',{...m,status:'suspended'},'leer'),false));
test('sin membresía no accede',()=>assert.equal(puedeGestionarCatalogo('user-a','org-a',null,'leer'),false));
test('sin identificadores no accede',()=>assert.equal(puedeGestionarCatalogo('','org-a',m,'leer'),false));
