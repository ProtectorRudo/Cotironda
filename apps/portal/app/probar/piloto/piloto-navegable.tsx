'use client';

import {useState} from 'react';
import {identificarProducto} from '../../../../../src/domain/taxonomia-materiales.ts';
import {
 EJEMPLO_PILOTO_MVP038,crearEscenarioMvp038,propuestasFicticiasMvp038,
 compararPilotoMvp038,type CotizacionFicticiaMvp038,
 type EscenarioPilotoMvp038
} from '../../../../../src/domain/piloto-navegable-mvp038.ts';
import type {ResultadoComparacion,IvaExplicito} from '../../../../../src/domain/comparacion-ofertas.ts';

type Etapa='pedido'|'cotizar'|'comparar'|'elegida';
const formato=(n:string)=>new Intl.NumberFormat('es-AR',{
 style:'currency',currency:'ARS',minimumFractionDigits:2
}).format(Number(n));
const ivaOpciones:{value:IvaExplicito|'';label:string}[]=[
 {value:'21',label:'IVA 21 %'},{value:'10.5',label:'IVA 10,5 %'},
 {value:'0',label:'IVA 0 % informado'},{value:'',label:'Sin aclarar'}
];
export function PilotoNavegableMvp038(){
 const [texto,setTexto]=useState(EJEMPLO_PILOTO_MVP038);
 const [zona,setZona]=useState('');
 const [escenario,setEscenario]=useState<EscenarioPilotoMvp038|null>(null);
 const [quotes,setQuotes]=useState<readonly CotizacionFicticiaMvp038[]>([]);
 const [comparacion,setComparacion]=useState<ResultadoComparacion|null>(null);
 const [etapa,setEtapa]=useState<Etapa>('pedido');
 const [elegida,setElegida]=useState<number|null>(null);
 const [error,setError]=useState('');
 function reiniciar(){
  setTexto(EJEMPLO_PILOTO_MVP038);setZona('');setEscenario(null);
  setQuotes([]);setComparacion(null);setEtapa('pedido');
  setElegida(null);setError('');
 }
 function preparar(){
  setError('');setEscenario(null);
  try{
   const s=crearEscenarioMvp038(texto,zona||null);
   setEscenario(s);
   if(s.pedido.estado==='listo_para_registrar'){
    setQuotes(propuestasFicticiasMvp038(s.pedido));
    setEtapa('cotizar');
   }
  }catch{
   setError('Revisá el pedido. Escribí una línea por material, con cantidad y unidad.');
  }
 }
 function cambiar(i:number,actualizacion:Partial<CotizacionFicticiaMvp038>){
  setQuotes(v=>v.map((q,n)=>n===i?{...q,...actualizacion}:q));
  setComparacion(null);
 }
 function cambiarLinea(i:number,j:number,actualizacion:Partial<CotizacionFicticiaMvp038['lineas'][number]>){
  setQuotes(v=>v.map((q,n)=>n!==i?q:{
   ...q,lineas:q.lineas.map((l,k)=>k===j?{...l,...actualizacion}:l)
  }));
  setComparacion(null);
 }
 function comparar(){
  if(!escenario)return;
  try{
   const c=compararPilotoMvp038(escenario.pedido,quotes);
   setComparacion(c);setEtapa('comparar');setElegida(null);setError('');
  }catch{
   setError('Revisá precios, mínimos, flete y días. Usá números sin puntos de miles, por ejemplo 12500,50.');
  }
 }
 const items=escenario?.pedido.items??[];
 const opciones=comparacion?.opcionesCompletas??[];
 const labels=new Map(items.map(i=>[i.product_code,i.source_description]));
 const elegidaDetalle=elegida===null?null:opciones[elegida];
 const preguntaZona=escenario!==null&&escenario.pedido.zonaEntrega===null;
 return <section className="m038-shell" aria-label="Ensayo integral de Cotironda">
  <ol className="m038-progress" aria-label="Pasos de la simulación">
   {(['pedido','cotizar','comparar','elegida'] as const).map((n,i)=>
    <li key={n} className={etapa===n?'m038-current':''}>
     {i+1}. {['Pedido','Respuestas','Comparar','Elección'][i]}
    </li>)}
  </ol>
  {etapa==='pedido'&&<div className="m038-panel">
   <p className="mvp-overline">1 · TU PEDIDO</p>
   <h2>¿Qué materiales necesitás?</h2>
   <p>Escribí o pegá la lista con cantidades y unidades. También podés copiar tres columnas de Excel. Incluí “Entrega en: La Plata” o te preguntamos después.</p>
   <label className="m038-label" htmlFor="m038-lista">Lista de materiales</label>
   <textarea id="m038-lista" className="mvp-textarea" rows={6}
    value={texto} maxLength={4000} spellCheck={false}
    onChange={e=>{setTexto(e.target.value);setEscenario(null);setZona('');setError('')}}
    placeholder="20 bolsas de cemento CPC 50 kg&#10;Entrega en: La Plata"/>
   {preguntaZona&&<div className="mvp-zone-required">
    <label htmlFor="m038-zona">¿Dónde se entregan los materiales?</label>
    <input id="m038-zona" className="mvp-zone-input" value={zona}
     maxLength={65} autoComplete="address-level2"
     placeholder="La Plata" onChange={e=>setZona(e.target.value)}/>
   </div>}
   {escenario?.pedido.pendientes.length!==0&&escenario?.pedido.pendientes.map((p,i)=>
    <p className="m038-warning" key={i} role="alert">
     {p.linea>0?`Línea ${p.linea}: `:''}{p.motivo}
     {p.linea>0&&<span> — {p.texto}</span>}
    </p>)}
   {error&&<p role="alert" className="m038-warning">{error}</p>}
   <button type="button" className="m038-primary" onClick={preparar}>
    Preparar pedido <span aria-hidden="true">→</span>
   </button>
   <p className="m038-small">Toda esta prueba funciona en el navegador. No guardamos el pedido.</p>
  </div>}
  {etapa==='cotizar'&&escenario&&<div className="m038-panel">
   <p className="mvp-overline">2 · DOS RESPUESTAS FICTICIAS</p>
   <h2>Así circularía tu pedido</h2>
   <p>Destino: <strong>{escenario.pedido.zonaEntrega}</strong>. Simulamos dos proveedores A y B. No son negocios reales ni han sido seleccionados por catálogo o zona.</p>
   <div className="m038-source">
    <strong>Solicitud preparada para cada simulador</strong>
    <ul>{items.map(i=><li key={i.product_code}>{i.quantity} {i.unit} · {i.source_description}</li>)}</ul>
    <small>WhatsApp enviados: 0. Los textos y precios son ficticios.</small>
   </div>
   <p className="m038-small">Las respuestas vienen precargadas con precios inventados para que puedas probar enseguida. Podés cambiar los valores, quitar artículos o dejar IVA y flete sin aclarar.</p>
   <div className="m038-grid">
    {quotes.map((q,i)=><article className="m038-supplier" key={q.anonId}>
     <h3>Proveedor ficticio {i===0?'A':'B'}</h3>
     <p className="m038-small">Respuesta simulada por WhatsApp (sin mensajes reales).</p>
     <label className="m038-toggle">
      <input type="checkbox" checked={q.presentada}
       onChange={e=>cambiar(i,{presentada:e.target.checked})}/>
      Respuesta recibida en la simulación
     </label>
     {q.lineas.map((l,j)=><div className="m038-line-edit" key={l.itemId}>
      <label className="m038-toggle">
       <input type="checkbox" checked={l.incluida}
        onChange={e=>cambiarLinea(i,j,{incluida:e.target.checked})}/>
       <strong>{labels.get(l.itemId)}</strong>
      </label>
      {l.incluida&&<div className="m038-input-grid">
       <label>Precio neto por unidad (ARS)
        <input inputMode="decimal" type="text" value={l.precioNeto}
         maxLength={12} onChange={e=>cambiarLinea(i,j,{precioNeto:e.target.value})}/>
       </label>
       <label>IVA
        <select value={l.iva}
         onChange={e=>cambiarLinea(i,j,{iva:e.target.value as IvaExplicito|''})}>
         {ivaOpciones.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}
        </select>
       </label>
      </div>}
     </div>)}
     <div className="m038-input-grid">
      <label>Flete total (ARS)
       <input inputMode="decimal" type="text" value={q.flete}
        maxLength={12} placeholder="Sin aclarar"
        onChange={e=>cambiar(i,{flete:e.target.value})}/>
      </label>
      <label>Mínimo de compra (ARS)
       <input inputMode="decimal" type="text" value={q.minimo}
        maxLength={12} onChange={e=>cambiar(i,{minimo:e.target.value})}/>
      </label>
      <label>Forma de pago
       <select value={q.pago} onChange={e=>cambiar(i,{
        pago:e.target.value as CotizacionFicticiaMvp038['pago']
       })}>
        <option value="transferencia">Transferencia</option>
        <option value="contado">Contado</option>
        <option value="cuenta_corriente_30_dias">Cuenta corriente a 30 días</option>
       </select>
      </label>
      <label>Entrega (días)
       <input inputMode="numeric" type="text" maxLength={3} value={q.plazoDias}
        onChange={e=>cambiar(i,{plazoDias:e.target.value})}/>
      </label>
     </div>
    </article>)}
   </div>
   {error&&<p className="m038-warning" role="alert">{error}</p>}
   <div className="m038-actions">
    <button className="m038-primary" type="button" onClick={comparar}>Comparar presupuestos →</button>
    <button className="m038-secondary" type="button"
     onClick={()=>{setEtapa('pedido');setEscenario(null);setZona('');setError('')}}>Editar pedido</button>
   </div>
  </div>}
  {(etapa==='comparar'||etapa==='elegida')&&comparacion&&<div className="m038-panel">
   <p className="mvp-overline">3 · COMPARACIÓN DE LA MISMA LISTA</p>
   <h2>Cobertura primero. Precio después.</h2>
   <p>Solo se calculan totales cuando hay cantidades y unidades compatibles, IVA y flete declarados, y condiciones equivalentes. Los precios son ficticios.</p>
   <div className="m038-grid">
    {comparacion.cobertura.map((c,i)=><article className="m038-supplier" key={c.anonId}>
     <h3>Oferta ficticia {i===0?'A':'B'}</h3>
     <strong>{c.lineasCompletas} de {c.lineasTotales} materiales cubiertos</strong>
     <ul className="m038-coverage">{c.lineas.map(l=><li key={l.itemId}>
      <span>{labels.get(l.itemId)}</span>
      <strong>{l.completa?'Cubre':'No cubre'}</strong>
     </li>)}</ul>
     <p>{c.totalComparable!==null?
      <strong>Total comparable: {formato(c.totalComparable)}</strong>:
      'Sin total comparable: faltan artículos, confirmación o condiciones explícitas.'}</p>
     {c.motivos.length>0&&<p className="m038-small">Observaciones: {c.motivos.join(', ').replaceAll('_',' ')}.</p>}
    </article>)}
   </div>
   <h3>Opciones que cubren el pedido completo</h3>
   {opciones.length===0&&<p className="m038-warning" role="status">
    No hay una alternativa completa comparable. Revisá artículos, IVA, flete y condiciones: no inventamos importes.
   </p>}
   {opciones.map((o,i)=><article key={i} className="m038-option">
    <div>
     <strong>{o.proveedoresAnonimos.map(v=>v==='anon_a'?'A':'B').join(' + ')}</strong>
     <span>{o.proveedoresAnonimos.length===1?'Un proveedor':'Dos proveedores'}</span>
    </div>
    <strong className="m038-price">{formato(o.totalFinal)}</strong>
    <p className="m038-small">ARS · {o.formaPago.replaceAll('_',' ')} · {o.plazoEntregaDias} días.
     Materiales con IVA informado: {formato(o.materialesConIva)}.
     Fletes declarados: {formato(o.fletesFinal)}.</p>
    <details><summary>Ver cómo se reparten los materiales</summary>
     <ul>{o.asignacion.map(a=><li key={a.itemId}>{labels.get(a.itemId)} — Oferta {a.anonId==='anon_a'?'A':'B'}</li>)}</ul>
    </details>
    {etapa==='comparar'&&<button className="m038-primary" type="button"
     onClick={()=>{setElegida(i);setEtapa('elegida')}}>Elegir esta opción en la prueba</button>}
   </article>)}
   {etapa==='elegida'&&elegidaDetalle&&<div className="m038-finished" role="status">
    <strong>Elegiste una alternativa ficticia de {formato(elegidaDetalle.totalFinal)}.</strong>
    <p>Es una selección visual. No se adjudicó, no se pagó, no se guardó y nadie recibió un mensaje.</p>
    <button className="m038-primary" type="button" onClick={reiniciar}>Probar otro pedido</button>
   </div>}
   <div className="m038-actions">
    <button type="button" className="m038-secondary"
     onClick={()=>{setEtapa('cotizar');setElegida(null);setComparacion(null);setError('')}}>Modificar presupuestos</button>
    <button type="button" className="m038-secondary" onClick={reiniciar}>Empezar de nuevo</button>
   </div>
  </div>}
 </section>;
}
