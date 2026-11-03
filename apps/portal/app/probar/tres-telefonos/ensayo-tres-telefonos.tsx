'use client';
import {useState} from 'react';
import {LISTADO_AMBOS_CORRALONES_MVP070,MATERIALES_CORRALON_DEMO_MVP070}
 from '../../../../../src/domain/catalogo-fixture-corralones-mvp070.ts';
import {
 PEDIDO_PILOTO_TRES_MVP071,PRESUPUESTO_A_MVP071,PRESUPUESTO_B_MVP071,
 prepararEnsayoTresMvp071,preservarPresupuestosTresMvp071
} from '../../../../../src/domain/piloto-integrado-tres-mvp071.ts';
type Plan=ReturnType<typeof prepararEnsayoTresMvp071>;
type Quotes=ReturnType<typeof preservarPresupuestosTresMvp071>;
export function EnsayoTresTelefonosMvp071(){
 const [pedido,setPedido]=useState(PEDIDO_PILOTO_TRES_MVP071);
 const [a,setA]=useState(LISTADO_AMBOS_CORRALONES_MVP070);
 const [b,setB]=useState(LISTADO_AMBOS_CORRALONES_MVP070);
 const [zonaA,setZonaA]=useState('La Plata');
 const [zonaB,setZonaB]=useState('La Plata');
 const [plan,setPlan]=useState<Plan|null>(null);
 const [presA,setPresA]=useState(PRESUPUESTO_A_MVP071);
 const [presB,setPresB]=useState(PRESUPUESTO_B_MVP071);
 const [quotes,setQuotes]=useState<Quotes|null>(null);
 const [error,setError]=useState('');
 const setDirty=()=>{setPlan(null);setQuotes(null);setError('');};
 function preparar(){
  try{
   const p=prepararEnsayoTresMvp071(pedido,zonaA,zonaB,a,b);
   setPlan(p);setQuotes(null);setError('');
  }catch{
   setPlan(null);setError('Revisá las listas: texto UTF-8, hasta 500 materiales por comercio, con cantidades y zona en el pedido.');
  }
 }
 function procesarPresupuestos(){
  try{
   setQuotes(preservarPresupuestosTresMvp071(presA,presB));setError('');
  }catch{setError('Completá el presupuesto de los dos corralones para comparar las fuentes.')}
 }
 return <section className="mvp-three" aria-label="Ensayo integrado de tres participantes">
  <div className="mvp3-note"><strong>Piloto simulado en tu navegador, sin WhatsApp real.</strong>
   {' '}No ingreses números de teléfono ni datos comerciales privados. No hay mensajes, almacenamiento ni empresas reales.</div>
  <h2>1. Dos corralones con el mismo catálogo inicial</h2>
  <p>Ambos comienzan con {MATERIALES_CORRALON_DEMO_MVP070.length} materiales habituales y sin precios. Podés probar cambios de lista y de zona por separado.</p>
  <div className="mvp3-cols">
   {([['A',a,setA,zonaA,setZonaA],['B',b,setB,zonaB,setZonaB]] as const).map(([name,items,update,zone,updateZone])=>
    <div className="mvp3-shop" key={name}>
     <h3>Corralón {name}</h3>
     <label htmlFor={'mvp3-inventory-'+name}>Materiales que trabaja</label>
     <textarea id={'mvp3-inventory-'+name} rows={7} value={items} maxLength={65536}
      onChange={e=>{update(e.target.value);setDirty();}} spellCheck={false}/>
     <label htmlFor={'mvp3-zone-'+name}>Zona de entrega declarada</label>
     <input id={'mvp3-zone-'+name} value={zone} maxLength={65}
      onChange={e=>{updateZone(e.target.value);setDirty();}}/>
    </div>
   )}
  </div>
  <div className="mvp3-shop">
   <h2>2. Pedido del arquitecto</h2>
   <label htmlFor="mvp3-pedido">Mensaje con cantidades y localidad de entrega</label>
   <textarea id="mvp3-pedido" rows={4} maxLength={4000} value={pedido}
    onChange={e=>{setPedido(e.target.value);setDirty();}} spellCheck={false}/>
   <button type="button" onClick={preparar}>Preparar consultas de los dos corralones</button>
   {plan&&<div aria-live="polite">
    <p>{plan.catalogos.corralon_a.reconocidos.length} materiales A reconocidos,
      {' '}{plan.catalogos.corralon_b.reconocidos.length} B reconocidos;
      {' '}{plan.catalogos.corralon_a.pendientes.length} pendientes A,
      {' '}{plan.catalogos.corralon_b.pendientes.length} pendientes B.</p>
    {plan.plan.estado==='pedido_necesita_aclaracion'?<p>Falta aclarar el pedido o la zona. No se consulta a nadie.</p>:
     <><p><strong>{plan.plan.invitaciones.length} consultas simuladas, 0 enviadas.</strong></p>
     {plan.plan.invitaciones.map(c=><article className="mvp3-result" key={c.comercio}>
      <h3>{c.comercio==='corralon_a'?'Corralón A':'Corralón B'}</h3>
      <ul>{c.items.map(i=><li key={i.line_no}>{i.quantity} {i.unit} · {i.source_description}</li>)}</ul>
     </article>)}
     {plan.plan.sinProveedor.length>0&&<div className="mvp3-result">
      <strong>Sin corralón que trabaje estos productos en la zona:</strong>
      <ul>{plan.plan.sinProveedor.map(i=><li key={i.line_no}>{i.source_description}</li>)}</ul>
     </div>}</>}
   </div>}
  </div>
  {plan&&plan.plan.estado==='simulacion_cobertura_sin_envio'&&
   <div className="mvp3-shop">
    <h2>3. Presupuestos recibidos</h2>
    <p>Estos son ejemplos ficticios editables. Si cambiás el pedido, actualizá también los presupuestos de ejemplo. Cada línea, pallet, bolsón, flete y total se conserva exactamente como fue escrito.</p>
    <div className="mvp3-cols">
     {([['A',presA,setPresA],['B',presB,setPresB]] as const).map(([name,value,change])=>
      <div key={name}>
       <label htmlFor={'mvp3-quote-'+name}>Presupuesto completo del corralón {name}</label>
       <textarea id={'mvp3-quote-'+name} rows={12} maxLength={12000} value={value}
        onChange={e=>{change(e.target.value);setQuotes(null);}} spellCheck={false}/>
      </div>
     )}
    </div>
    <button type="button" onClick={procesarPresupuestos}>Registrar ambas respuestas simuladas</button>
    {quotes&&<div className="mvp3-cols" aria-live="polite">
     {([['A',quotes.a],['B',quotes.b]] as const).map(([name,q])=>
      <article className="mvp3-result" key={name}>
       <h3>Presupuesto original A/B: {name}</h3>
       <pre>{q.original}</pre>
       <p>Total literalmente declarado: <strong>{q.totalLiteral??'Sin total único verificable'}</strong></p>
       {q.revisionTotal&&<p>Importe ambiguo: revisar sin alterar el original.</p>}
      </article>
     )}
    </div>}
    {quotes&&<p><strong>Sin ranking económico todavía.</strong> La igualdad de catálogos no demuestra igualdad de cantidades, IVA, flete o cobertura cotizada. Se necesita extracción y comparación de líneas equivalentes verificables. No se declara ganador.</p>}
   </div>}
  {error&&<p className="mvp3-error" role="alert">{error}</p>}
  <p className="mvp3-foot">0 WhatsApps enviados · 0 datos guardados · 0 cobros · 0 contactos revelados. Este ensayo no reemplaza un webhook autenticado ni el registro real de catálogos.</p>
 </section>;
}
