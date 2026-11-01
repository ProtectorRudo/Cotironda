'use client';
import {useState,type ReactNode} from 'react';
import {separarListaWhatsappNaturalMvp058}
 from '../../../../../src/domain/lista-whatsapp-natural-mvp058.ts';
import {prepararPedidoTextoMvp028}
 from '../../../../../src/domain/pedido-piloto-mvp028.ts';
import {
 MENSAJE_DEMO_MVP065,crearPrototipoWhatsAppMvp065,
 registrarCorreccionFicticiaMvp065,resumenFuenteFielMvp065,
 evaluarCoberturaMvp065,type EscenarioWhatsAppMvp065,
 type OfertaSimuladaMvp065,type RolComercioMvp065
} from '../../../../../src/domain/prototipo-whatsapp-mvp065.ts';

type Etapa='pedido'|'distribucion'|'respuestas'|'comparacion'|'cierre';
const etapas:Readonly<{key:Etapa;label:string}[]>=[
 {key:'pedido',label:'Pedido'},{key:'distribucion',label:'Consultas'},
 {key:'respuestas',label:'Presupuestos'},
 {key:'comparacion',label:'Comparación'},{key:'cierre',label:'Cierre'}
];
function Etiqueta({children}:{children:ReactNode}){
 return <span className="cw65-tag">{children}</span>;
}
function Original({texto}:{texto:string}){
 const f=resumenFuenteFielMvp065(texto);
 return <div className="cw65-original">
  <div className="cw65-original-head"><strong>Original del comercio · sin modificaciones</strong>
   <Etiqueta>{f.lineas.length} renglones</Etiqueta></div>
  <pre aria-label="Presupuesto íntegro del proveedor">{texto}</pre>
  <div className="cw65-total">
   <span>Total declarado por el comercio</span>
   <strong>{f.totalLiteral??'No verificable'}</strong>
  </div>
  {f.revisionTotal&&<p className="cw65-notice">Hay varios totales o un total ambiguo.
   Se conserva todo el texto; Cotironda no inventa una cifra definitiva.</p>}
  <p className="cw65-minor">Este total no reemplaza la comparación. Puede incluir pallets, bolsones,
   flete, descuentos o artículos no solicitados.</p>
 </div>;
}
export function PrototipoWhatsappCuatroTelefonosMvp065(){
 const [etapa,setEtapa]=useState<Etapa>('pedido');
 const [texto,setTexto]=useState(MENSAJE_DEMO_MVP065);
 const [zona,setZona]=useState('');
 const [pedirZona,setPedirZona]=useState(false);
 const [escenario,setEscenario]=useState<EscenarioWhatsAppMvp065|null>(null);
 const [ofertas,setOfertas]=useState<readonly OfertaSimuladaMvp065[]>([]);
 const [draft,setDraft]=useState<Partial<Record<RolComercioMvp065,string>>>({});
 const [error,setError]=useState('');
 const [avisos,setAvisos]=useState<Partial<Record<RolComercioMvp065,string>>>({});
 const catalogo=(escenario?.pedido.items??[]).map(i=>[i.product_code,
  i.quantity+' '+i.unit+' · '+i.source_description] as const);
 const etiquetas=new Map(catalogo);
 const cobertura=escenario?evaluarCoberturaMvp065(escenario,ofertas):null;
 function comenzar(){
  setError('');
  try{
   const preparado=prepararPedidoTextoMvp028(
    separarListaWhatsappNaturalMvp058(texto),zona.trim()||null);
   const onlyZone=preparado.pendientes.length>0&&
    preparado.pendientes.every(p=>p.linea===0&&p.texto==='Zona de entrega');
   if(onlyZone){setPedirZona(true);return}
   if(preparado.estado!=='listo_para_registrar'){
    setError(preparado.pendientes.map(p=>p.motivo+
     (p.linea>0?' (línea '+p.linea+')':'')).join(' · '));
    return;
   }
   const next=crearPrototipoWhatsAppMvp065(texto,zona.trim()||null);
   setEscenario(next);
   setOfertas(next.ofertas);
   setDraft({});
   setAvisos({});
   setPedirZona(false);setEtapa('distribucion');
  }catch{
   setError('Revisá la lista. Para la prueba usá cantidades, unidades y materiales reconocidos.');
  }
 }
 function guardarCorreccion(oferta:OfertaSimuladaMvp065){
  const nuevo=draft[oferta.id];
  if(nuevo===undefined||nuevo===oferta.historial.at(-1)){
   setAvisos(v=>({...v,[oferta.id]:'No hay cambios para registrar.'}));
   return;
  }
  try{
   const revised=registrarCorreccionFicticiaMvp065(oferta,nuevo);
   setOfertas(v=>v.map(o=>o.id===oferta.id?revised:o));
   setAvisos(v=>({...v,[oferta.id]:
    'Corrección simulada guardada como versión '+revised.historial.length+
    '. La anterior permanece íntegra.'}));
  }catch{
   setAvisos(v=>({...v,[oferta.id]:'Escribí un presupuesto válido de hasta 12.000 caracteres.'}));
  }
 }
 function restart(){
  setEtapa('pedido');setEscenario(null);setOfertas([]);
  setDraft({});setAvisos({});setError('');setPedirZona(false);
  setTexto(MENSAJE_DEMO_MVP065);setZona('');
 }
 return <section className="cw65-shell" aria-label="Prototipo WhatsApp de Cotironda">
  <ol className="cw65-progress" aria-label="Etapas de la prueba">
   {etapas.map((e,i)=><li key={e.key}
    className={etapa===e.key?'cw65-active':''}
    aria-current={etapa===e.key?'step':undefined}>
    <span>{i+1}</span>{e.label}
   </li>)}
  </ol>
  {etapa==='pedido'&&<div className="cw65-panel">
   <div className="cw65-kicker">01 · Arquitecto</div>
   <h2>Un mensaje. Toda la obra.</h2>
   <p>Así empieza Cotironda: el arquitecto manda su lista al número central
    de WhatsApp. En esta demo la escribís acá, sin enviar ningún mensaje real.</p>
   <div className="cw65-phone">
    <div className="cw65-phone-head"><span className="cw65-avatar">C</span>
     <div><strong>Cotironda</strong><small>Simulación de chat · sin conexión</small></div>
    </div>
    <label className="cw65-label" htmlFor="cw65-pedido">Mensaje del arquitecto</label>
    <textarea id="cw65-pedido" rows={5} maxLength={4000}
     value={texto} onChange={e=>{setTexto(e.target.value);setError('');setPedirZona(false)}}
     spellCheck={false}/>
    {pedirZona&&<div className="cw65-ask-zone">
     <strong>¿En qué localidad hay que entregar los materiales?</strong>
     <input value={zona} onChange={e=>setZona(e.target.value)}
      autoComplete="address-level2" maxLength={65}
      placeholder="Ej.: La Plata" aria-label="Localidad de entrega"/>
    </div>}
   </div>
   {error&&<p className="cw65-alert" role="alert">{error}</p>}
   <button className="cw65-primary" type="button" onClick={comenzar}>
    {pedirZona?'Continuar con la localidad':'Simular recepción del pedido'}
    <span aria-hidden="true">→</span>
   </button>
   <p className="cw65-minor">Usamos una lista ficticia precargada. No escribas presupuestos comerciales reales.</p>
  </div>}
  {etapa==='distribucion'&&escenario&&<div className="cw65-panel">
   <div className="cw65-kicker">02 · Cotironda clasifica</div>
   <h2>Cada comercio recibe solo lo que vende.</h2>
   <p>Sin elegir proveedores manualmente. La selección de esta prueba se basa
    en catálogos ficticios y la zona informada; en el piloto real se verificará
    la cobertura de entrega.</p>
   <div className="cw65-destination">
    <span>Destino de la obra</span><strong>{escenario.pedido.zonaEntrega}</strong>
   </div>
   <div className="cw65-stats">
    <div><strong>{escenario.pedido.items.length}</strong><span>materiales reconocidos</span></div>
    <div><strong>{ofertas.length}</strong><span>consultas preparadas</span></div>
    <div><strong>0</strong><span>WhatsApps reales enviados</span></div>
   </div>
   <div className="cw65-cards">
    {ofertas.map(o=><article className="cw65-shop" key={o.id}>
     <div className="cw65-shop-head"><span className="cw65-avatar">W</span>
      <div><strong>{o.anonimo}</strong><small>{o.rubro} · Ficticio</small></div>
      <Etiqueta>Preparada</Etiqueta>
     </div>
     <p className="cw65-minor">Solicitud que recibiría:</p>
     <ul>{o.productosCotizados.map(code=><li key={code}>
      {etiquetas.get(code)??code}</li>)}</ul>
     <p className="cw65-minor">Entrega: {escenario.pedido.zonaEntrega}</p>
    </article>)}
   </div>
   <div className="cw65-actions"><button type="button" className="cw65-primary"
    onClick={()=>setEtapa('respuestas')}>Simular respuestas por WhatsApp →</button>
    <button type="button" className="cw65-secondary"
     onClick={()=>setEtapa('pedido')}>Volver al pedido</button></div>
  </div>}
  {etapa==='respuestas'&&escenario&&<div className="cw65-panel">
   <div className="cw65-kicker">03 · Comercios responden</div>
   <h2>El presupuesto no se toca.</h2>
   <p>Los negocios cotizan por mensaje, con todos sus renglones. Incluso
    si agregan pallets, bolsones vacíos, descuentos o flete, Cotironda
    debe respetarlos tal como los escribieron.</p>
   <div className="cw65-cards">
    {ofertas.map(o=><article className="cw65-shop" key={o.id}>
     <div className="cw65-shop-head"><span className="cw65-avatar">W</span>
      <div><strong>{o.anonimo}</strong><small>{o.rubro} · Ficticio</small></div>
      <Etiqueta>Versión {o.historial.length}</Etiqueta>
     </div>
     <Original texto={o.historial.at(-1)??''}/>
     <details className="cw65-edit"><summary>Simular corrección del proveedor</summary>
      <p className="cw65-minor">Podés añadir cualquier renglón, cambiar el total o
       escribir una aclaración. Se creará una versión nueva; jamás se borrará la anterior.</p>
      <textarea rows={9} maxLength={12000}
       aria-label={'Editar presupuesto de '+o.anonimo}
       value={draft[o.id]??o.historial.at(-1)??''}
       onChange={e=>setDraft(v=>({...v,[o.id]:e.target.value}))}/>
      <button type="button" className="cw65-secondary"
       onClick={()=>guardarCorreccion(o)}>Registrar nueva versión ficticia</button>
      {avisos[o.id]&&<p className="cw65-minor" role="status">{avisos[o.id]}</p>}
      {o.historial.length>1&&<details><summary>Ver versiones anteriores sin modificar</summary>
       {o.historial.slice(0,-1).map((v,i)=><div key={i} className="cw65-history">
        <strong>Versión {i+1}</strong><pre>{v}</pre>
       </div>)}</details>}
     </details>
    </article>)}
   </div>
   <div className="cw65-actions">
    <button type="button" className="cw65-primary"
     onClick={()=>setEtapa('comparacion')}>Ver comparación responsable →</button>
    <button type="button" className="cw65-secondary"
     onClick={()=>setEtapa('distribucion')}>Volver a consultas</button>
   </div>
  </div>}
  {etapa==='comparacion'&&escenario&&cobertura&&<div className="cw65-panel">
   <div className="cw65-kicker">04 · Resultado transparente</div>
   <h2>Primero cobertura, después precio.</h2>
   <p>Las ofertas parciales nunca compiten por total contra presupuestos
    con más materiales. Los importes originales permanecen visibles,
    pero no declaramos un ganador con IVA o cargos pendientes.</p>
   <div className="cw65-stats">
    <div><strong>{cobertura.cubiertos.length}/{escenario.pedido.items.length}</strong>
     <span>tipos de materiales con comercios de prueba</span></div>
    <div><strong>{ofertas.length}</strong><span>ofertas ficticias</span></div>
   </div>
   <div className="cw65-cards">
    {ofertas.map(o=>{
     const edited=o.historial.at(-1)!==o.plantillaOriginal;
     const summary=resumenFuenteFielMvp065(o.historial.at(-1)??'');
     return <article className="cw65-shop" key={o.id}>
      <div className="cw65-shop-head"><strong>{o.anonimo}</strong>
       <Etiqueta>{o.productosCotizados.length} materiales de su oferta</Etiqueta></div>
      <ul>{o.productosPedido.map(code=><li key={code}>
       {etiquetas.get(code)??code}</li>)}</ul>
      <div className="cw65-total"><span>Total declarado</span>
       <strong>{summary.totalLiteral??'Sin total único'}</strong></div>
      <p className="cw65-minor">{edited
       ?'Se modificó el texto original. Requiere nueva extracción y verificación; no inferimos cobertura ni precios desde una versión anterior.'
       :'Cubre los materiales listados; puede incluir otros cargos y artículos no solicitados.'}</p>
      <details className="cw65-edit"><summary>Ver presupuesto original íntegro</summary>
       <Original texto={o.historial.at(-1)??''}/></details>
     </article>;
    })}
   </div>
   <div className="cw65-warning">
    <strong>Sin ranking económico todavía.</strong>
    <p>Algunos presupuestos no aclaran IVA o flete, o agregan pallets y bolsones.
     No sumamos cifras que no son equivalentes ni inventamos un total final.
     Los totales declarados siguen siendo exactamente los del comercio.</p>
    {ofertas.some(o=>o.historial.at(-1)!==o.plantillaOriginal)&&
     <p>Hay correcciones simuladas: corresponde revisar de nuevo sus artículos y condiciones antes de comparar.</p>}
   </div>
   <h3>Posibles coberturas con hasta dos proveedores</h3>
   {cobertura.posiblesCoberturasConDos.length?
    <ul className="cw65-possibilities">
     {cobertura.posiblesCoberturasConDos.map(x=><li key={x}>{x} · Cobertura posible, no adjudicación</li>)}
    </ul>:
    <p className="cw65-minor">Ninguna pareja cubre todos los materiales del pedido en esta prueba.</p>}
   {cobertura.sinProveedor.length>0&&<p className="cw65-alert">
    Sin comercio simulado para: {cobertura.sinProveedor.join(', ')}.</p>}
   <button type="button" className="cw65-primary"
    onClick={()=>setEtapa('cierre')}>Simular cierre de ronda →</button>
  </div>}
  {etapa==='cierre'&&<div className="cw65-panel cw65-finish">
   <div className="cw65-kicker">05 · Cierre simulado</div>
   <h2>La decisión sucede entre las partes.</h2>
   <p>En Cotironda real, al terminar el plazo se podrán revelar los contactos
    de hasta dos finalistas, solamente según las reglas y consentimientos
    autorizados. El arquitecto no adjudica nada dentro de la plataforma.</p>
   <div className="cw65-warning"><strong>Esta prueba no revela contactos ni envía WhatsApps.</strong>
    <p>No hay ganadores reales, cobros, compras ni mensajes enviados.</p></div>
   <button type="button" className="cw65-primary"
    onClick={restart}>Probar de nuevo con otro pedido →</button>
  </div>}
 </section>;
}
