'use client';
import {useState} from 'react';
import {generarComparacionDemo} from '../../../../../src/domain/mvp-comparacion-demo.ts';

const demo=generarComparacionDemo();
const money=(value:string)=>new Intl.NumberFormat('es-AR',{
  style:'currency',currency:'ARS',minimumFractionDigits:2
}).format(Number(value));
const pago:Readonly<Record<string,string>>={
  transferencia:'Transferencia',contado:'Contado',
  cuenta_corriente_30_dias:'Cuenta corriente 30 días'
};
const motivo:Readonly<Record<string,string>>={
  oferta_no_confirmada:'Aún no confirmada',
  item_no_cotizado:'No cotiza este material',
  equivalencia_no_verificada:'Equivalencia sin verificar',
  unidad_diferente:'Unidad distinta',
  cantidad_insuficiente:'Cantidad insuficiente'
};
export function EjemploOfertas(){
  const [seleccion,setSeleccion]=useState<number|null>(null);
  const options=demo.comparacion.opcionesCompletas;
  const elegida=seleccion!==null?options[seleccion]:null;
  const grupos=[...new Set(options.map(x=>x.grupoCondiciones))];
  return <section className="mc-shell" aria-label="Ofertas ficticias comparadas">
    <div className="mc-toolbar">
      <div>
        <p className="mc-kicker">Paso 3 · Comparar</p>
        <h2>Una comparación que tiene sentido</h2>
        <p>Los valores son inventados. La matemática utiliza el comparador real de Cotironda, sin conectarse a ningún comercio.</p>
      </div>
      <span className="mc-label">DEMO · SIN COMPRAS</span>
    </div>
    <section className="mc-section" aria-labelledby="mc-pedido-title">
      <div className="mc-subtitle"><h3 id="mc-pedido-title">Pedido de ejemplo</h3><span>3 materiales</span></div>
      <ul className="mc-order">{demo.pedido.items.map((p,i)=>
        <li key={p.id}><span>{String(i+1).padStart(2,'0')}</span>{demo.etiquetas[p.id]}</li>
      )}</ul>
      <p className="mc-note">Este pedido es fijo y ficticio. No son cotizaciones generadas a partir de la lista que hayas escrito en la pantalla anterior.</p>
    </section>
    <section className="mc-section" aria-labelledby="mc-ofertas-title">
      <div className="mc-subtitle"><h3 id="mc-ofertas-title">Cobertura de cada oferta</h3><span>Proveedores anónimos</span></div>
      <div className="mc-coverage">
        {demo.comparacion.cobertura.map(o=>
          <article key={o.anonId} className="mc-coverage-card">
            <div className="mc-card-head"><strong>{o.anonId.replace('anon_','Oferta ').toUpperCase()}</strong>
              <span className={o.confirmada?'mc-pill-ok':'mc-pill-warn'}>{o.confirmada?'Confirmación ficticia':'Sin confirmar'}</span></div>
            <div className="mc-coverage-big">{o.lineasCompletas} <span>de {o.lineasTotales} materiales cubiertos</span></div>
            <ul>{o.lineas.map(l=><li key={l.itemId}>
              <span>{demo.etiquetas[l.itemId]}</span>
              <strong className={l.completa?'mc-yes':'mc-no'}>
                {l.completa?'Completo':motivo[l.motivo??'']??'Sin cobertura'}
              </strong></li>)}</ul>
            <p className="mc-coverage-footer">{o.totalComparable!==null
              ? <>Canasta completa: <strong>{money(o.totalComparable)}</strong></>
              : 'Sin total de canasta comparable. Una oferta parcial no compite por su subtotal.'}</p>
          </article>
        )}
      </div>
    </section>
    <section className="mc-section" aria-labelledby="mc-combinaciones-title">
      <div className="mc-subtitle"><h3 id="mc-combinaciones-title">Opciones que cubren todo</h3>
        <span>Máximo 2 proveedores</span></div>
      <p className="mc-muted">Solo aparecen ofertas confirmadas en el ejemplo, con cantidades, equivalencia, IVA, flete y condiciones completas. No se comparan precios de distintas condiciones entre sí.</p>
      {options.length===0&&<div className="mc-warning" role="status">No hay combinaciones completas para comparar.</div>}
      {grupos.map(group=><div key={group} className="mc-group">
        <p className="mc-conditions">{options.find(x=>x.grupoCondiciones===group)?.moneda} · {pago[options.find(x=>x.grupoCondiciones===group)?.formaPago??'']??'Condición desconocida'} · Entrega en {options.find(x=>x.grupoCondiciones===group)?.plazoEntregaDias} días</p>
        <div className="mc-options">
          {options.map((o,i)=>o.grupoCondiciones!==group?null:
            <article className={seleccion===i?'mc-option mc-option-selected':'mc-option'} key={i}>
              <div className="mc-option-header">
                <div>
                  <span className="mc-option-eyebrow">{o.proveedoresAnonimos.length===1?'Un solo proveedor':'Combinación de dos proveedores'}</span>
                  <h4>{o.proveedoresAnonimos.map(id=>id.replace('anon_','Oferta ').toUpperCase()).join(' + ')}</h4>
                </div>
                {o.puestoDentroDeCondiciones!==null&&<span className="mc-rank">Puesto {o.puestoDentroDeCondiciones} en estas condiciones</span>}
              </div>
              <strong className="mc-total">{money(o.totalFinal)}</strong>
              <p className="mc-breakdown">Materiales + IVA: {money(o.materialesConIva)} · Fletes: {money(o.fletesFinal)}</p>
              <details className="mc-details"><summary>Ver qué cotiza cada proveedor</summary>
                <ul>{o.asignacion.map(a=><li key={a.itemId}><span>{demo.etiquetas[a.itemId]}</span><strong>{a.anonId.replace('anon_','Oferta ').toUpperCase()}</strong></li>)}</ul>
              </details>
              <button className="mc-select" type="button"
                aria-pressed={seleccion===i} onClick={()=>setSeleccion(seleccion===i?null:i)}>
                {seleccion===i?'Quitar elección':'Elegir esta opción en la demo'}
              </button>
            </article>
          )}
        </div>
      </div>)}
      {elegida&&<div className="mc-chosen" role="status" aria-live="polite">
        <strong>Elegiste una opción de ejemplo: {money(elegida.totalFinal)}</strong>
        <p>Esta elección es únicamente visual. No se registra, no adjudica materiales y no revela ningún contacto.</p>
        <button type="button" className="mc-clear" onClick={()=>setSeleccion(null)}>Cambiar elección</button>
      </div>}
    </section>
    <div className="mc-footer"><strong>¿Qué sucede en una ronda real?</strong>
      <p>Los proveedores responden y confirman precios. Recién entonces Cotironda calcula las alternativas comparables; el comprador decide a quién adjudicar. Esta pantalla no envía WhatsApp, no guarda datos y no realiza compras.</p>
    </div>
  </section>;
}
