'use client';
import {useState} from 'react';
import Link from 'next/link';
import {EJEMPLO_PEDIDO_MVP,type VistaCompradorMvp} from '../../../../src/domain/mvp-vista-comprador-d057.ts';
import {prepararPedidoSinFriccionMvp008} from '../../../../src/domain/pedido-sin-friccion-mvp008.ts';

const LIMITE=9000;
type Pestaña='materiales'|'proveedores';
export function DemostracionComprador(){
  const [texto,setTexto]=useState(EJEMPLO_PEDIDO_MVP);
  const [resultado,setResultado]=useState<VistaCompradorMvp|null>(null);
  const [error,setError]=useState('');
  const [pestana,setPestana]=useState<Pestaña>('materiales');
  const [preguntarZona,setPreguntarZona]=useState(false);
  const [zona,setZona]=useState('');
  const [zonaUsada,setZonaUsada]=useState('');
  function analizar(){
    setError('');
    setResultado(null);
    if(texto.trim().length===0){
      setError('Pegá una lista de materiales para empezar.');return;
    }
    if(texto.length>LIMITE){
      setError('La demostración admite hasta 9.000 caracteres. Dividí el pedido para probarlo.');return;
    }
    try{
      const preparada=prepararPedidoSinFriccionMvp008({
        texto,zonaRespondida:zona.trim()||null
      });
      if(preparada.estado==='falta_zona_entrega'){
        setPreguntarZona(true);
        return;
      }
      setPreguntarZona(false);
      setZonaUsada(preparada.zonaEntrega);
      setResultado(preparada.vista);
      setPestana('materiales');
    }catch(e){
      setError(e instanceof Error && e.message==='mvp008_zona_invalida'
        ?'Revisá la zona de entrega. Escribí solo la localidad (por ejemplo: La Plata).'
        :'No pudimos interpretar esa lista con seguridad. Probá con cantidades y unidades por línea (por ejemplo: 10 bolsas cemento).');
    }
  }
  function reiniciar(){
    setTexto(EJEMPLO_PEDIDO_MVP);
    setResultado(null);
    setError('');
    setPestana('materiales');
    setPreguntarZona(false);
    setZona('');
    setZonaUsada('');
  }
  const listaVacia=resultado!==null&&resultado.proveedores.length===0;
  return <section className="mvp-shell" aria-label="Demostración del comprador">
    <div className="mvp-progress" aria-label="Recorrido demostrativo">
      <span className="mvp-progress-active">1. Pedido</span>
      <span className={resultado?'mvp-progress-active':''}>2. Proveedores</span>
      <span>3. Comparación (solo demo)</span>
    </div>
    <div className="mvp-editor">
      <div className="mvp-editor-title">
        <div>
          <p className="mvp-overline">TU PEDIDO</p>
          <h2>Escribí o pegá tus materiales</h2>
          <p>Una línea por material. Cotironda prepara las consultas sin pedirte confirmaciones. Si falta la zona de entrega, te la preguntamos.</p>
        </div>
        <span className="mvp-tag">Prueba local</span>
      </div>
      <label htmlFor="mvp-lista" className="mvp-label">Lista de materiales</label>
      <textarea
        id="mvp-lista" className="mvp-textarea"
        value={texto} onChange={event=>{
          setTexto(event.target.value);
          if(resultado!==null)setResultado(null);
          setPreguntarZona(false);
          setZona('');
          if(error)setError('');
        }}
        maxLength={LIMITE+1}
        rows={6}
        spellCheck={false}
        placeholder={'Ejemplo:\n10 bolsas cemento\n5 litros pintura látex interior\nNecesito presupuesto con IVA incluido'}
        aria-describedby="mvp-privacidad"
      />
      <div className="mvp-field-footer">
        <span id="mvp-privacidad">Se procesa en este navegador. No se guarda ni se envía.</span>
        <span>{texto.length.toLocaleString('es-AR')} / {LIMITE.toLocaleString('es-AR')}</span>
      </div>
      {preguntarZona&&<div className="mvp-zone-required" role="group" aria-labelledby="mvp-zone-prompt">
        <label id="mvp-zone-prompt" htmlFor="mvp-zone">¿En qué localidad o zona entregamos los materiales?</label>
        <input id="mvp-zone" className="mvp-zone-input" autoComplete="address-level2"
          placeholder="Ejemplo: La Plata" value={zona} maxLength={65}
          onChange={e=>setZona(e.target.value)} />
        <small>Es el único dato que necesitamos ahora para buscar comercios que entreguen en esa zona.</small>
      </div>}
      {error&&<p className="mvp-error" role="alert">{error}</p>}
      <div className="mvp-cta">
        <button className="mvp-primary" type="button" onClick={analizar}>
          {preguntarZona?'Continuar con la zona':'Analizar pedido'} <span aria-hidden="true">→</span>
        </button>
        <button className="mvp-secondary" type="button" onClick={reiniciar}>
          Restaurar ejemplo
        </button>
      </div>
    </div>
    {resultado&&<section className="mvp-results" aria-label="Resultado de la simulación" aria-live="polite">
      <div className="mvp-result-header">
        <div><p className="mvp-overline">ANÁLISIS TERMINADO</p>
          <h2>Así quedaría tu solicitud</h2>
          <p>Entrega: <strong>{zonaUsada}</strong>. Consultas preparadas con catálogos ficticios; sin aprobaciones extra.</p>
        </div>
        <span className="mvp-check">Vista de prueba</span>
      </div>
      <div className="mvp-stats">
        <div><strong>{resultado.lineas}</strong><span>Líneas recibidas</span></div>
        <div><strong>{resultado.aprovechadas}</strong><span>Listas para consultar</span></div>
        <div><strong>{resultado.pendientes}</strong><span>Con dudas</span></div>
        <div><strong>{resultado.invitaciones}</strong><span>Comercios de ejemplo</span></div>
      </div>
      {resultado.avisoIva&&<aside className={resultado.condicionIvaComprador==='contradictorio'?'mvp-iva-note mvp-iva-alert':'mvp-iva-note'} role="note">
        <strong>Condición solicitada por el comprador</strong>
        <p>{resultado.avisoIva}</p>
        <small>Esta condición se detectó en una línea de tu pedido y no se contó como material. Los mensajes siguen siendo simulados.</small>
      </aside>}
      <div className="mvp-tabs" role="tablist" aria-label="Resultados">
        <button type="button" role="tab" id="mvp-tab-materiales"
          aria-selected={pestana==='materiales'} aria-controls="mvp-panel-materiales"
          className={pestana==='materiales'?'mvp-active':''}
          onClick={()=>setPestana('materiales')}>Materiales detectados</button>
        <button type="button" role="tab" id="mvp-tab-proveedores"
          aria-selected={pestana==='proveedores'} aria-controls="mvp-panel-proveedores"
          className={pestana==='proveedores'?'mvp-active':''}
          onClick={()=>setPestana('proveedores')}>Proveedores ({resultado.invitaciones})</button>
      </div>
      <div id="mvp-panel-materiales" role="tabpanel"
        aria-labelledby="mvp-tab-materiales" hidden={pestana!=='materiales'}>
        {resultado.filas.map(f=><div className="mvp-line" key={f.numero}>
          <span className="mvp-number">{String(f.numero).padStart(2,'0')}</span>
          <div><strong>{f.texto}</strong>
            {f.motivo&&<p>{f.motivo}</p>}
          </div>
          <span className={f.estado==='preparada'?'mvp-line-good':'mvp-line-pending'}>
            {f.estado==='preparada'?'Reconocido':'Revisar'}
          </span>
        </div>)}
      </div>
      <div id="mvp-panel-proveedores" role="tabpanel"
        aria-labelledby="mvp-tab-proveedores" hidden={pestana!=='proveedores'}>
        {listaVacia&&<p className="mvp-empty">Ningún comercio del catálogo ficticio coincide con este pedido. No se inventan destinatarios.</p>}
        {resultado.proveedores.map(p=><article className="mvp-supplier" key={p.id}>
          <div className="mvp-supplier-top">
            <div><span className="mvp-supplier-icon" aria-hidden="true">▣</span>
              <strong>{p.nombre}</strong><span className="mvp-supplier-category">{p.rubro}</span>
            </div>
            <span className="mvp-line-good">Solicitud preparada</span>
          </div>
          <ul>{p.items.map((item,i)=><li key={i}>{item}</li>)}</ul>
          <details>
            <summary>Ver solicitud con zona de entrega</summary>
            <div className="mvp-message">
              {p.mensajes.map((mensaje,i)=><p key={i}>{mensaje}</p>)}
            </div>
          </details>
          {p.requiereValidarAlternativas&&<p className="mvp-hint">
            Las marcas, presentaciones y especificaciones alternativas necesitan verificación; no se consideran equivalentes automáticamente.
          </p>}
        </article>)}
      </div>
      <div className="mvp-bottom-note">
        <strong>Lo que falta para una ronda verdadera</strong>
        <p>Los proveedores todavía no reciben mensajes en esta demo. En el flujo real, envías el pedido una sola vez y cada comercio responde por WhatsApp; su cotización se registra al recibirla y puede corregirla cuando lo necesite, sin responder «Confirmo». Mientras tanto, podés explorar ofertas inventadas.</p>
        <Link className="mvp-compare-link" href="/probar/piloto">Probar pedido → respuestas → comparación en una ronda ficticia</Link>
        <p className="m038-small">La comparación de esta pantalla es independiente y utiliza otro pedido de ejemplo.</p>
        <Link className="mvp-compare-link" href="/probar/ofertas">Ver cómo se comparan las ofertas ficticias →</Link>
      </div>
    </section>}
  </section>;
}
