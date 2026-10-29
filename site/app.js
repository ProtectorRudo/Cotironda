'use strict';
const opc = Object.freeze({
  single: Object.freeze({title:'Oferta A · Compra completa', materiales:1300000, fletes:40000, descripcion:'Un solo proveedor abastece los 13 materiales. En este ejemplo resulta $ 10.000 más conveniente que dividir la compra.'}),
  combined: Object.freeze({title:'Ofertas B + A · Compra completa', materiales:1250000, fletes:100000, descripcion:'Los materiales cuestan menos al combinar proveedores, pero el segundo flete hace que la compra total sea $ 10.000 más cara.'})
});
const fmt = value => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(value);
function mostrar(opcion){
  if(!Object.hasOwn(opc, opcion)) return;
  const data=opc[opcion];
  for(const type of ['single','combined']) document.getElementById(type).setAttribute('aria-pressed',String(type===opcion));
  document.getElementById('result-type').textContent=data.title;
  document.getElementById('materials').textContent=fmt(data.materiales);
  document.getElementById('shipping').textContent=fmt(data.fletes);
  document.getElementById('total').textContent=fmt(data.materiales+data.fletes);
  document.getElementById('summary').textContent=data.descripcion;
}
for(const type of ['single','combined']) document.getElementById(type).addEventListener('click',()=>mostrar(type));
mostrar('single');
