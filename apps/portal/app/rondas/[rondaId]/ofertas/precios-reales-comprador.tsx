'use client';
import {useCallback,useEffect,useState} from 'react';
import type {PrecioRecibidoMvp014}
 from '../../../../../../src/server/cotizaciones-recibidas-http-mvp014.ts';
import type {ResumenRonda} from '../../../../../../src/server/rondas-lectura-http.ts';
import './ofertas-recibidas.css';

type Datos=Readonly<{ronda:ResumenRonda;ofertas:readonly PrecioRecibidoMvp014[]}>;
type Estado='cargando'|'listo'|'error'|'no_habilitado'|'sin_acceso'|'no_encontrado';
const iva:Readonly<Record<PrecioRecibidoMvp014['vat_basis'],string>>={
 incluido:'IVA incluido según proveedor',
 no_incluido:'IVA no incluido según proveedor',
 no_informado:'IVA no informado',
 contradictorio:'IVA contradictorio: verificar'
};
const unit:Readonly<Record<string,string>>={
 unit:'unidad',bag:'bolsa',box:'caja',kg:'kg',g:'g',l:'litro',
 ml:'ml',m:'m',m2:'m²',m3:'m³',roll:'rollo',pack:'paquete'
};
const metodo:Readonly<Record<string,string>>={
 contado:'Contado',transferencia:'Transferencia',
 cuenta_corriente_30_dias:'Cuenta corriente a 30 días'
};
function fmt(value:string):string{
 const [integer,decimals='00']=value.split('.');
 return integer.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+decimals;
}
function fmtQty(value:string):string{
 const [integer,decimals='']=value.split('.');
 const clean=decimals.replace(/0+$/,'');
 return integer.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+
   (clean?','+clean:'');
}
export function PreciosRealesComprador({rondaId}:{rondaId:string}){
 const [estado,setEstado]=useState<Estado>('cargando');
 const [datos,setDatos]=useState<Datos|null>(null);
 const cargar=useCallback(async(signal?:AbortSignal)=>{
  setEstado('cargando');
  try{
   const res=await fetch('/api/rondas/'+encodeURIComponent(rondaId)+'/cotizaciones',{
    method:'GET',credentials:'same-origin',cache:'no-store',
    headers:{accept:'application/json'},signal
   });
   if(signal?.aborted)return;
   if(!res.ok){
    setDatos(null);
    setEstado(res.status===401?'sin_acceso':res.status===404?'no_encontrado':
      res.status===503?'no_habilitado':'error');
    return;
   }
   const obj=await res.json() as Datos;
   if(signal?.aborted)return;
   setDatos(obj);setEstado('listo');
  }catch{
   if(!signal?.aborted){setDatos(null);setEstado('error');}
  }
 },[rondaId]);
 useEffect(()=>{
  const controller=new AbortController();
  void cargar(controller.signal);
  return()=>controller.abort();
 },[cargar]);
 const groups=new Map<string,PrecioRecibidoMvp014[]>();
 if(datos)for(const line of datos.ofertas){
  const arr=groups.get(line.supplier_alias)??[];
  arr.push(line);groups.set(line.supplier_alias,arr);
 }
 const suppliers=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
 return <section className="mvp014-box" aria-live="polite">
  <div className="mvp014-head">
   <div><p className="mvp014-overline">TUS COTIZACIONES · LECTURA REAL</p>
    <h1>Ofertas recibidas</h1>
    <p>Precios que enviaron los comercios, sin nombres ni contactos durante la ronda.
     Los importes no se completan con IVA o flete supuestos.</p>
   </div>
   {datos&&<button type="button" className="mvp014-refresh"
      onClick={()=>void cargar()} disabled={estado==='cargando'}>
      Actualizar ofertas
    </button>}
  </div>
  {estado!=='listo'&&<div className="mvp014-state" role="status">
   {estado==='cargando'?'Consultando tus cotizaciones…':
    estado==='sin_acceso'?'Iniciá sesión con tu cuenta de comprador para consultar esta ronda.':
    estado==='no_encontrado'?'No encontramos esta ronda entre las solicitudes de tu empresa.':
    estado==='no_habilitado'?'Las cotizaciones reales todavía no están habilitadas en este entorno. No se mostraron precios de ejemplo.':
    'No pudimos consultar las ofertas. Probá nuevamente.'}
   {estado==='error'&&<button className="mvp014-refresh" type="button"
     onClick={()=>void cargar()}>Reintentar</button>}
  </div>}
  {datos&&estado==='listo'&&<>
   <div className="mvp014-summary">
    <span>Ronda: <strong>{datos.ronda.round_status}</strong></span>
    <span>Materiales solicitados: <strong>{datos.ronda.items.length}</strong></span>
    <span>Proveedores con oferta: <strong>{suppliers.length}</strong></span>
   </div>
   {suppliers.length===0&&<p className="mvp014-empty">
    Todavía no se registraron cotizaciones para esta ronda. Acá aparecerán
    automáticamente cuando lleguen y puedan verificarse.
   </p>}
   <div className="mvp014-grid">
    {suppliers.map(([alias,lines],index)=>{
     const map=new Map(lines.map(x=>[x.line_no,x]));
     const priced=lines.filter(x=>x.quoted_unit_price!==null).length;
     const first=lines[0];
     return <article key={alias} className="mvp014-card">
      <div className="mvp014-card-title">
       <div><span className="mvp014-alias">Oferta {index+1}</span>
        <h2>Proveedor anónimo</h2></div>
       <span className="mvp014-version">Versión {first.offer_version}</span>
      </div>
      <p className="mvp014-coverage">{priced} de {datos.ronda.items.length} artículos
       con precio declarado{priced<datos.ronda.items.length?' · oferta parcial':''}</p>
      <div className="mvp014-lines">
       {datos.ronda.items.map(item=>{
        const offer=map.get(item.line_no);
        return <div className="mvp014-line" key={item.line_no}>
         <div><strong>{item.product_code.replaceAll('_',' ')}</strong>
          <small>Solicitado: {fmtQty(item.quantity)} {unit[item.unit]??item.unit}</small></div>
         {offer&&offer.quoted_unit_price!==null?
          <div className="mvp014-price">
           <strong>{offer.currency} {fmt(offer.quoted_unit_price)}</strong>
           <small>Por {unit[offer.quoted_unit]??offer.quoted_unit} ·
            disponible: {fmtQty(offer.available_qty)} {unit[offer.quoted_unit]??offer.quoted_unit}</small>
           <small className={offer.vat_basis==='no_informado'||offer.vat_basis==='contradictorio'
            ?'mvp014-uncertain':''}>{iva[offer.vat_basis]}</small>
          </div>:
          <span className="mvp014-missing">Sin precio declarado</span>}
        </div>;
       })}
      </div>
      <div className="mvp014-terms">
       <p><strong>Flete:</strong> {first.freight_gross===null?'No informado':
        first.currency+' '+fmt(first.freight_gross)}</p>
       <p><strong>Pago:</strong> {first.payment_method===null?'No informado':
        metodo[first.payment_method]}</p>
       <p><strong>Entrega:</strong> {first.lead_days===null?'Plazo no informado':
        first.lead_days+' días'}</p>
      </div>
     </article>;
    })}
   </div>
   <p className="mvp014-caution">Los importes son precios unitarios declarados.
    <strong> No son totales finales ni un ranking de precios.</strong> La comparación
    económica exige cobertura, equivalencia de materiales, unidades, impuestos,
    flete y condiciones de pago compatibles. La elección sigue siendo del comprador.</p>
  </>}
 </section>;
}
