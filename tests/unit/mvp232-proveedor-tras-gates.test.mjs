import test from 'node:test';
import assert from 'node:assert/strict';
import {proveedorConRondaCentralMvp232} from
 '../../supabase/functions/cotironda-piloto-whapi/ai-central-supplier-route-mvp232.ts';

test('MVP232: proveedor con PDF api_accepted sigue bajo IA al vencer la prueba',()=>{
 assert.equal(proveedorConRondaCentralMvp232(true,'not_central_supplier'),true);
 assert.equal(proveedorConRondaCentralMvp232(true,null),true);
});
test('MVP232: controles de nuevas rondas OFF no cambian reply_only validado por SQL',()=>{
 assert.equal(proveedorConRondaCentralMvp232(true,'not_central_supplier'),true);
});
test('MVP232: la ruta central previa sigue protegiendo jobs pendientes sin atribuir una oferta',()=>{
 assert.equal(proveedorConRondaCentralMvp232(false,'central_supplier'),true);
});
test('MVP232: desconocido, texto truthy y permiso inválido NO se promueven',()=>{
 for(const permiso of [false,null,undefined,'true',1,{},[]]){
  assert.equal(proveedorConRondaCentralMvp232(permiso,'not_central_supplier'),false);
 }
 assert.equal(proveedorConRondaCentralMvp232(false,'supplier'),false);
});
