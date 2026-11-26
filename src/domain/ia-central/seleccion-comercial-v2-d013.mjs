/**
 * CANDIDATO D013: selección comercial pura sobre pares YA autorizados.
 * No lee pedidos, no clasifica, no modifica catálogos, no consulta stock.
 * rubrosPorArticulo debe venir de clasificación comercial acreditada;
 * jamás usar 'otros' u obra_gruesa como sustituto de los rubros faltantes.
 * historial: oportunidades por proveedor/rubro, no precios ni ventas.
 * El llamador conserva el plan original si no puede aplicar este candidato.
 */
export function seleccionarComercialD013({destinos,rubrosPorArticulo,historial,maximo=7}){
 const fallback=motivo=>({estado:'conservar_original',motivo,destinos});
 const rubros=new Set(['corralon','hormigon_elaborado','hierros_aceros','construccion_seca','electricidad','sanitarios_gas','maderas','pintureria_tecnica','techos_aislantes','ferreteria']);
 const key=/^[a-z][a-z0-9_]{2,63}$/u;
 try{
  if(maximo!==7||!Array.isArray(destinos)||!Array.isArray(rubrosPorArticulo)||
     !Array.isArray(historial)||rubrosPorArticulo.length<1||
     rubrosPorArticulo.some(r=>!rubros.has(r)))return fallback('rubros_o_entrada_no_acreditados');
  const history=new Map();
  for(const h of historial){
   if(!h||!key.test(h.proveedor)||!rubros.has(h.rubro)||
      !Number.isSafeInteger(h.oportunidades)||h.oportunidades<0||
      !Number.isSafeInteger(h.ultimo)||h.ultimo<0)return fallback('historial_invalido');
   const id=h.rubro+'|'+h.proveedor;
   if(history.has(id))return fallback('historial_duplicado');
   history.set(id,h);
  }
  const groups=new Map(),suppliers=new Set();
  for(const d of destinos){
   if(!d||!key.test(d.proveedor)||suppliers.has(d.proveedor)||
      !Array.isArray(d.correspondencias)||!d.correspondencias.length)return fallback('destinos_invalidos');
   suppliers.add(d.proveedor);const seen=new Set();
   for(const m of d.correspondencias){
    const i=m?.indicePedido;
    if(!Number.isSafeInteger(i)||i<0||i>=rubrosPorArticulo.length||
       seen.has(i)||!['producto_declarado','alternativa_razonable'].includes(m.tipo))
      return fallback('pares_invalidos');
    seen.add(i);
    const rubro=rubrosPorArticulo[i];
    if(!groups.has(rubro))groups.set(rubro,new Map());
    const g=groups.get(rubro);
    if(!g.has(d.proveedor))g.set(d.proveedor,[]);
    g.get(d.proveedor).push(m);
   }
  }
  const chosen=new Map();
  for(const [rubro,g] of groups){
   const uncovered=new Set([...g.values()].flatMap(rows=>rows.map(m=>m.indicePedido)));
   const left=[...g.entries()];
   const selected=[];
   while(left.length&&selected.length<maximo){
    const stats=([p,rows])=>{
     const h=history.get(rubro+'|'+p)??{oportunidades:0,ultimo:0};
     return [rows.filter(m=>uncovered.has(m.indicePedido)).length,rows.length,
      rows.filter(m=>m.tipo==='producto_declarado').length,h.oportunidades,h.ultimo,p];
    };
    left.sort((a,b)=>{
     const x=stats(a),y=stats(b);
     return y[0]-x[0]||y[1]-x[1]||y[2]-x[2]||x[3]-y[3]||x[4]-y[4]||x[5].localeCompare(y[5],'en');
    });
    const [p,rows]=left.shift();selected.push(p);
    for(const m of rows)uncovered.delete(m.indicePedido);
   }
   // Si siete no alcanzan para conservar cobertura, NO publicar un plan
   // truncado. Se mantiene el circuito anterior dentro de su capacidad.
   if(uncovered.size)return fallback('cupo_no_preserva_cobertura');
   chosen.set(rubro,new Set(selected));
  }
  // Consolidar multirrubro por clave original: un único envío por comercio.
  const filtered=destinos.map(d=>({...d,correspondencias:d.correspondencias.filter(m=>
   chosen.get(rubrosPorArticulo[m.indicePedido])?.has(d.proveedor))})).filter(d=>d.correspondencias.length);
  if(!filtered.length)return fallback('sin_destinos');
  const covered=new Set(filtered.flatMap(d=>d.correspondencias.map(m=>m.indicePedido)));
  if(destinos.some(d=>d.correspondencias.some(m=>!covered.has(m.indicePedido))))return fallback('cobertura_inconsistente');
  return {estado:'seleccionada',motivo:'cupo_cobertura_rotacion',destinos:filtered};
 }catch{return fallback('selector_indisponible')}
}
