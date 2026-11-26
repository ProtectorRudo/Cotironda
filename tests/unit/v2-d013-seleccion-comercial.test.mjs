import assert from 'node:assert/strict';
import {seleccionarComercialD013 as select} from '../../src/domain/ia-central/seleccion-comercial-v2-d013.mjs';
const row=(i)=>({indicePedido:i,numeroCatalogo:1,tipo:'producto_declarado',explicacion:'original'});
const mk=(prefix,n,indices)=>Array.from({length:n},(_,i)=>({proveedor:prefix+'_'+String(i).padStart(2,'0'),correspondencias:indices.map(row)}));
const go=(destinos,rubrosPorArticulo,historial=[])=>select({destinos,rubrosPorArticulo,historial});
const check=(label,fn)=>{fn();console.log('OK '+label)};
check('14 corralones, exactamente 7',()=>assert.equal(go(mk('corralon',14,[0]),['corralon']).destinos.length,7));
check('segunda ronda rota a los otros siete',()=>{
 const ds=mk('corralon',14,[0]),a=go(ds,['corralon']);
 const b=go(ds,['corralon'],a.destinos.map(d=>({proveedor:d.proveedor,rubro:'corralon',oportunidades:1,ultimo:1})));
 assert.equal(b.destinos.length,7);assert.ok(b.destinos.every(d=>!a.destinos.some(x=>x.proveedor===d.proveedor)));
});
check('cinco rubros, 35 comercios independientes',()=>{
 const rs=['corralon','hormigon_elaborado','hierros_aceros','construccion_seca','electricidad'];
 const ds=rs.flatMap((r,i)=>mk(r,14,[i]));const a=go(ds,rs);assert.equal(a.destinos.length,35);
 for(let i=0;i<rs.length;i++)assert.equal(a.destinos.filter(d=>d.correspondencias.some(m=>m.indicePedido===i)).length,7);
});
check('un comercio multirrubro, un solo destino',()=>{
 const ds=mk('multi',14,[0,1]);const a=go(ds,['corralon','hierros_aceros']);assert.equal(a.destinos.length,7);assert.ok(a.destinos.every(d=>d.correspondencias.length===2));
});
check('dos proveedores no se reducen',()=>assert.equal(go(mk('corralon',2,[0]),['corralon']).destinos.length,2));
check('proveedor exclusivo preservado',()=>{
 const ds=[...mk('corralon',14,[0]),...mk('especial',1,[1])];const a=go(ds,['corralon','corralon']);
 assert.equal(a.destinos.length,7);assert.ok(a.destinos.some(d=>d.proveedor==='especial_00'));
});
check('imposibilidad de cubrir 8 exclusivos: conservar original',()=>{
 const ds=Array.from({length:8},(_,i)=>({proveedor:'especial_'+i,correspondencias:[row(i)]}));
 const a=go(ds,Array(8).fill('corralon'));assert.equal(a.estado,'conservar_original');assert.equal(a.destinos,ds);
});
check('clasificación ambigua: conservar original',()=>{const ds=mk('corralon',14,[0]);assert.equal(go(ds,['otros']).destinos,ds)});
check('historial inválido: conservar original',()=>{const ds=mk('corralon',14,[0]);assert.equal(go(ds,['corralon'],[{proveedor:'corralon_00',rubro:'corralon',oportunidades:-1,ultimo:0}]).destinos,ds)});
check('no fabricar coincidencias ni mutar originales',()=>{
 const ds=mk('corralon',14,[0,1]);const before=JSON.stringify(ds);const a=go(ds,['corralon','maderas']);
 assert.equal(JSON.stringify(ds),before);for(const d of a.destinos)for(const m of d.correspondencias)assert.ok(ds.find(x=>x.proveedor===d.proveedor).correspondencias.includes(m));
});
check('sin mínimo comercial como gate',()=>assert.equal(go(mk('solo',1,[0]),['corralon']).estado,'seleccionada'));
check('destinos duplicados: no seleccionar',()=>{const ds=mk('corralon',1,[0]);const du=[ds[0],ds[0]];assert.equal(go(du,['corralon']).destinos,du)});
