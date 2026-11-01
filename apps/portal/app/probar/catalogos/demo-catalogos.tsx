'use client';
import {useState} from 'react';
import {
 analizarListadoComercioMvp069,simularConsultasCatalogosMvp069,
 type LecturaCatalogoMvp069,type FormatoCatalogoMvp069
} from '../../../../../src/domain/catalogo-listado-mvp069.ts';
import {LISTADO_AMBOS_CORRALONES_MVP070,PEDIDO_COMUN_DEMO_MVP070,
 MATERIALES_CORRALON_DEMO_MVP070} from '../../../../../src/domain/catalogo-fixture-corralones-mvp070.ts';

type Shop='corralon_a'|'corralon_b';
type Input=Readonly<{
 texto:string;zona:string;formato:FormatoCatalogoMvp069;
 archivo:string|null;lectura:LecturaCatalogoMvp069|null;error:string;
}>;
// Both independent panels start with identical, fictional, price-free stock.
const initial:Record<Shop,Input>={
 corralon_a:{texto:LISTADO_AMBOS_CORRALONES_MVP070,
  zona:'La Plata',formato:'texto',archivo:null,lectura:null,error:''},
 corralon_b:{texto:LISTADO_AMBOS_CORRALONES_MVP070,
  zona:'La Plata',formato:'texto',archivo:null,lectura:null,error:''}
};
const pedidoInicial=PEDIDO_COMUN_DEMO_MVP070;
const names:Record<Shop,string>={corralon_a:'Corralón A',corralon_b:'Corralón B'};
const message:Record<string,string>={
 sin_familia_verificada:'Familia no reconocida: revisar antes de habilitar',
 duplicado:'Producto repetido en el listado',
 formula_o_contenido_inseguro:'Contenido inseguro o fórmula',
 descripcion_invalida:'Descripción inválida',
 producto_no_corresponde_al_rubro:'El rubro de la fila no coincide con el producto'
};
type Sim=ReturnType<typeof simularConsultasCatalogosMvp069>;
export function DemoCatalogosPilotoMvp069(){
 const [data,setData]=useState<Record<Shop,Input>>(initial);
 const [pedido,setPedido]=useState(pedidoInicial);
 const [sim,setSim]=useState<Sim|null>(null);
 const [error,setError]=useState('');
 function update(id:Shop,patch:Partial<Input>){
  setData(v=>({...v,[id]:{...v[id],...patch}}));
  setSim(null);setError('');
 }
 async function cargarArchivo(id:Shop,file:File|undefined){
  if(!file)return;
  const ext=file.name.toLowerCase().split('.').at(-1);
  if(!['txt','csv'].includes(ext??'')||file.size>65536||file.size===0){
   update(id,{lectura:null,error:'Elegí un CSV o TXT UTF-8 de hasta 64 KB. Para XLSX o PDF todavía falta la carga segura.'});
   return;
  }
  try{
   const raw=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
   update(id,{texto:raw,archivo:file.name,formato:ext==='csv'?'csv':'texto',
    lectura:null,error:''});
  }catch{
   update(id,{lectura:null,error:'El archivo no parece ser texto UTF-8 válido.'});
  }
 }
 function analizar(id:Shop){
  try{
   update(id,{lectura:analizarListadoComercioMvp069(data[id].texto,data[id].formato),error:''});
  }catch{
   update(id,{lectura:null,error:'No se pudo interpretar el listado. Para CSV usá una columna «Producto» o «Material» y exportalo como CSV UTF-8.'});
  }
 }
 function simular(){
  setError('');setSim(null);
  if(!data.corralon_a.lectura||!data.corralon_b.lectura){
   setError('Analizá primero los dos listados.');return;
  }
  try{
   setSim(simularConsultasCatalogosMvp069({pedido,comercios:[
    {id:'corralon_a',zona:data.corralon_a.zona,catalogo:data.corralon_a.lectura},
    {id:'corralon_b',zona:data.corralon_b.zona,catalogo:data.corralon_b.lectura}
   ]}));
  }catch{
   setError('Revisá el pedido: cantidades, unidades, producto y localidad de entrega deben ser claros.');
  }
 }
 return <section className="cat69-shell" aria-label="Ensayo de catálogos de proveedores">
  <div className="cat69-intro">
   <h2>1. Cargá qué materiales trabajan</h2>
   <p>Los dos corralones empiezan con el mismo listado de {MATERIALES_CORRALON_DEMO_MVP070.length} materiales típicos. Podés modificar cada uno o subir otro archivo. Todo se interpreta en este navegador, sin enviarlo al servidor.</p>
  </div>
  <div className="cat69-grid">
   {(['corralon_a','corralon_b'] as Shop[]).map(id=>{
    const current=data[id];
    return <article className="cat69-card" key={id}>
     <div className="cat69-head"><span className="cat69-letter">{id==='corralon_a'?'A':'B'}</span>
      <div><h3>{names[id]}</h3><p>Mismo catálogo inicial · sin precios</p></div></div>
     <label className="cat69-label" htmlFor={'cat69-file-'+id}>Subir un listado CSV / TXT</label>
     <input id={'cat69-file-'+id} type="file" accept=".csv,.txt,text/csv,text/plain"
      onChange={e=>{void cargarArchivo(id,e.target.files?.[0]);e.target.value='';}}/>
     {current.archivo&&<p className="cat69-small">Archivo seleccionado: {current.archivo}</p>}
     <label className="cat69-label" htmlFor={'cat69-format-'+id}>Formato del listado</label>
     <select id={'cat69-format-'+id} value={current.formato}
      onChange={e=>update(id,{formato:e.target.value as FormatoCatalogoMvp069,lectura:null})}>
      <option value="texto">Una descripción por línea</option>
      <option value="csv">CSV exportado de Excel (con encabezado)</option>
     </select>
     <label className="cat69-label" htmlFor={'cat69-list-'+id}>Listado de materiales</label>
     <textarea id={'cat69-list-'+id} rows={6} value={current.texto} maxLength={65536}
      spellCheck={false} onChange={e=>update(id,{texto:e.target.value,lectura:null})}/>
     <label className="cat69-label" htmlFor={'cat69-zone-'+id}>Localidad a la que entrega</label>
     <input id={'cat69-zone-'+id} type="text" value={current.zona} maxLength={65}
      onChange={e=>update(id,{zona:e.target.value})}/>
     <button className="cat69-primary" type="button" onClick={()=>analizar(id)}>Analizar listado</button>
     {current.error&&<p className="cat69-error" role="alert">{current.error}</p>}
     {current.lectura&&<div className="cat69-results" role="status">
      <p><strong>{current.lectura.reconocidos.length}</strong> líneas reconocidas · <strong>{current.lectura.pendientes.length}</strong> pendientes</p>
      {current.lectura.reconocidos.length>0&&<ul>
       {current.lectura.reconocidos.map(x=><li key={x.fila}>
        <strong>{x.descripcion}</strong><span>{x.rubro.replaceAll('_',' ')} · {x.producto_id}</span>
       </li>)}
      </ul>}
      {current.lectura.pendientes.length>0&&<details><summary>Ver productos que requieren revisión ({current.lectura.pendientes.length})</summary>
       <ul>{current.lectura.pendientes.map(x=><li key={x.fila}>
        <strong>Línea {x.fila}: {x.descripcion}</strong><span>{message[x.motivo]}</span>
       </li>)}</ul>
      </details>}
      {current.lectura.avisos.map(x=><p key={x} className="cat69-small">{x}</p>)}
      <p className="cat69-small">Lectura preliminar, no catálogo publicado. La habilitación real exige identidad, consentimiento y curaduría.</p>
     </div>}
    </article>;
   })}
  </div>
  <div className="cat69-order">
   <h2>2. Probá el pedido del arquitecto</h2>
   <p>El pedido incluye una localidad de entrega. Los corralones solo reciben familias que figuran en sus listados interpretados.</p>
   <label className="cat69-label" htmlFor="cat69-order">Materiales solicitados</label>
   <textarea id="cat69-order" rows={5} value={pedido} maxLength={4000}
    onChange={e=>{setPedido(e.target.value);setSim(null);}}/>
   <button type="button" className="cat69-primary" onClick={simular}>
    Simular a quién se consulta →
   </button>
   {error&&<p className="cat69-error" role="alert">{error}</p>}
  </div>
  {sim&&<section className="cat69-order" role="status" aria-label="Resultado de distribución">
   <h2>3. Resultado de la simulación</h2>
   {sim.estado==='pedido_necesita_aclaracion'?
    <p>El arquitecto debe aclarar un dato: {sim.pendientes.map(x=>x.motivo).join(' · ')}</p>:
    <>
     <p><strong>{sim.invitaciones.length}</strong> corralones con productos compatibles y cobertura de zona.</p>
     {sim.invitaciones.map(x=><div className="cat69-invite" key={x.comercio}>
      <h3>{names[x.comercio as Shop]}</h3>
      <ul>{x.items.map(i=><li key={i.line_no}>{i.quantity} {i.unit} · {i.source_description}</li>)}</ul>
     </div>)}
     {sim.invitaciones.length===0&&<p>Ninguno debería recibir este pedido: no hay cobertura verificada en esta simulación.</p>}
     {sim.sinProveedor.length>0&&<div className="cat69-pending">
      <strong>Artículos sin negocio compatible en esta prueba:</strong>
      <ul>{sim.sinProveedor.map(i=><li key={i.line_no}>{i.source_description}</li>)}</ul>
     </div>}
    </>}
   <p className="cat69-small">0 WhatsApps enviados · 0 catálogos guardados · 0 empresas reales identificadas. No se calcula precio ni se adjudican operaciones.</p>
  </section>}
 </section>;
}
