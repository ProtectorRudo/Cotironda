'use client';
import {useState} from 'react';
import {generarComparacionDemo,OFERTAS_DEMO} from '../../../../../src/domain/mvp-comparacion-demo.ts';
import {detalleEconomicoExplicito} from '../../../../../src/domain/detalle-economico-explicito-mvp005.ts';

const demo=generarComparacionDemo();
const detalles=new Map(OFERTAS_DEMO.map(o=>[o.anonId,detalleEconomicoExplicito(o)]));
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
              ? <>Importe comparable, según datos declarados: <strong>{money(o.totalComparable)}</strong></>
              : 'No se muestra un importe comparable: puede faltar cobertura, confirmación o una aclaración económica.'}</p>
            {detalles.get(o.anonId)?.tienePendientes&&
              <p className="mc-pending-note">Hay condiciones pendientes de aclaración. No se presupone IVA ni flete.</p>}
            <details className="mc-details mc-economic-details">
              <summary>Ver aclaraciones de IVA y flete</summary>
              <ul>{detalles.get(o.anonId)?.ivaPorLinea.map(d=><li key={d.itemId}>
                <span className="mc-detail-text"><strong>{demo.etiquetas[d.itemId]}</strong>
                  <small>{d.precioBase.texto}</small>
                  <small className={d.iva.estado==='pendiente'?'mc-pending':''}>{d.iva.texto}</small></span>
              </li>)}
                <li><span className={detalles.get(o.anonId)?.flete.estado==='pendiente'?'mc-pending':'mc-detail-text'}>
                  {detalles.get(o.anonId)?.flete.texto}
                </span></li>
              </ul>
              <p className="mc-note">Los datos de este ejemplo son ficticios; en una ronda real deben ser confirmados por el proveedor.</p>
            </details>
          </article>
        )}
      </div>
    </section>
    <section className="mc-section" aria-labelledby="mc-combinaciones-title">
      <div className="mc-subtitle"><h3 id="mc-combinaciones-title">Opciones que cubren todo</h3>
        <span>Máximo 2 proveedores</span></div>
      <p className="mc-muted">Solo se calculan opciones cuando los datos necesarios fueron declarados y son comparables. Si el IVA o el flete no se aclaran, no se inventa un importe total. Consultá los detalles de cada oferta.</p>
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
              <span className="mc-option-eyebrow">Importe comparable según datos declarados</span>
              <strong className="mc-total">{money(o.totalFinal)}</strong>
              <p className="mc-breakdown">IVA y transporte: condiciones en detalles, nunca supuestos.</p>
              <details className="mc-details"><summary>Ver asignación y aclaraciones económicas</summary>
                <ul>{o.asignacion.map(a=><li key={a.itemId}><span>{demo.etiquetas[a.itemId]}</span><strong>{a.anonId.replace('anon_','Oferta ').toUpperCase()}</strong></li>)}
                  <li><span>Materiales calculados con las tasas de IVA declaradas en el ejemplo:</span><strong>{money(o.materialesConIva)}</strong></li>
                  <li><span>Fletes informados por los proveedores de prueba:</span><strong>{money(o.fletesFinal)}</strong></li>
                </ul>
                <p className="mc-note">Revisá las aclaraciones individuales de IVA y flete de cada proveedor antes de elegir.</p>
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
        <strong>Elegiste una opción de ejemplo, según los datos declarados: {money(elegida.totalFinal)}</strong>
        <p>Esta elección es únicamente visual. No se registra, no adjudica materiales y no revela ningún contacto.</p>
        <button type="button" className="mc-clear" onClick={()=>setSeleccion(null)}>Cambiar elección</button>
      </div>}
    </section>
    <div className="mc-footer"><strong>¿Qué sucede en una ronda real?</strong>
      <p>Los proveedores responden y confirman precios. Recién entonces Cotironda calcula las alternativas comparables; el comprador decide a quién adjudicar. Esta pantalla no envía WhatsApp, no guarda datos y no realiza compras.</p>
    </div>
  </section>;
}
