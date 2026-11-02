import Link from 'next/link';
import {crearPlantillasAnonimasMvp079} from '../../../../../src/domain/plantilla-cotizacion-mvp079.ts';
import './plantilla.css';

export const metadata={
 title:'Plantilla de presupuesto anónimo | Cotironda',
 description:'Ensayo de presentación propia de Cotironda con materiales, extras y total literal sin identificar al proveedor.',
 robots:{index:false,follow:false}
};

const ejemploA=[
 'Corralón Ejemplo A - Tel: +5492215555555',
 '20 bolsas de cemento x $ 9.500,00 = $ 190.000,00',
 '5 litros hidrofugo x $ 4.200,00 = $ 21.000,00',
 '2 pallets vacíos x $ 7.000,00 = $ 14.000,00',
 'Flete: $ 12.000,00',
 'Descuento: -$ 3.000,00',
 'TOTAL FINAL: $ 234.000,00',
 'IVA no informado'
].join('\n');
const ejemploB=[
 'Pinturería Ejemplo B - Contacto: +5492215559999',
 '20 bolsas de cemento x $ 9.700,00 = $ 194.000,00',
 '5 litros hidrofugo x $ 4.100,00 = $ 20.500,00',
 'Flete a convenir',
 'TOTAL FINAL: $ 214.500,00',
 'Sin IVA'
].join('\n');
const vista=crearPlantillasAnonimasMvp079([
 {idInterno:'proveedor_ensayo_01',revision:1,textoOriginal:ejemploA,
  privacidad:'revisada_por_servidor',lineas:[
   'privado','material','material','embalaje','flete','descuento','total','aclaracion'
  ].map((categoria,i)=>({numeroLinea:i+1,categoria:categoria as
    'privado'|'material'|'embalaje'|'flete'|'descuento'|'total'|'aclaracion'}))},
 {idInterno:'proveedor_ensayo_02',revision:1,textoOriginal:ejemploB,
  privacidad:'revisada_por_servidor',lineas:[
   'privado','material','material','flete','total','aclaracion'
  ].map((categoria,i)=>({numeroLinea:i+1,categoria:categoria as
    'privado'|'material'|'flete'|'total'|'aclaracion'}))}
]);
const categorias:Record<string,string>={
 material:'Material solicitado',adicional:'Artículo adicional',
 embalaje:'Embalaje / adicional',flete:'Envío',descuento:'Descuento',
 impuesto:'Impuesto',aclaracion:'Condición',subtotal:'Subtotal',total:'Total declarado'
};
function importeSeparado(value:string|null){
 if(value===null)return 'Sin verificar';
 const sign=value.startsWith('-')?'-':'';
 const [whole,centavos]=value.replace(/^-/, '').split('.');
 const grouped=whole.replace(/\B(?=(\d{3})+(?!\d))/gu,'.');
 return sign+'$ '+grouped+','+centavos;
}
export default function PlantillaCotirondaMvp079(){
 return <main className="cotipl-page"><div className="cotipl-container">
  <nav className="cotipl-back"><Link href="/probar">← Volver a las pruebas</Link></nav>
  <header className="cotipl-hero">
   <div><p className="cotipl-eyebrow">COTIRONDA · PRESENTACIÓN DE OFERTAS</p>
    <h1>Un formato claro.<br/><span>La cotización intacta.</span></h1>
    <p>El arquitecto ve los conceptos comerciales y totales declarados por cada proveedor, sin abrir sus archivos ni conocer su identidad durante la ronda.</p>
   </div>
   <div className="cotipl-hero-note"><span>Vista de ensayo</span>
    <strong>Materiales, cargos y condiciones.</strong>
    <p>Los ejemplos son ficticios. Sin conexión a Whapi o Supabase ni ranking de ganadores.</p>
   </div>
  </header>
  <div className="cotipl-notice" role="note">
   <strong>Importante:</strong> el valor declarado y la suma auditada son conceptos distintos. Los datos no verificables se muestran tal como fueron escritos, sin inventar cifras.
  </div>
  <div className="cotipl-offers">
   {vista.ofertas.map(o=><article key={o.etiqueta} className="cotipl-card">
    <div className="cotipl-card-header">
     <div className="cotipl-brand">COTI<span>RONDA</span><small>LA NUEVA FORMA DE COTIZAR</small></div>
     <div className="cotipl-anon"><strong>{o.etiqueta}</strong><span>Identidad reservada</span></div>
    </div>
    <div className="cotipl-card-title">
     <div><p>Presupuesto de materiales</p><h2>Detalle de la propuesta</h2></div>
     <span className="cotipl-revision">Versión {o.revision}</span>
    </div>
    {o.estado==='lista_para_vista'?<>
     <div className="cotipl-tablewrap"><table><thead><tr>
      <th>Concepto original</th><th>Importe auditado</th>
     </tr></thead><tbody>{o.renglones.filter(l=>l.categoria!=='total').map(l=>
      <tr key={l.numeroLinea}>
       <td><span className="cotipl-type">{categorias[l.categoria]}</span>
        <div className="cotipl-literal">{l.textoLiteral}</div></td>
       <td className="cotipl-amount">{importeSeparado(l.importeComprobable)}</td>
      </tr>)}</tbody></table></div>
     <div className="cotipl-final">
      <div><small>Total declarado por el proveedor</small>
       <strong>{o.totalLiteral??'No informado'}</strong></div>
      <span className="cotipl-verified">{o.totalVerificado?'Formato del total verificable':'Total literal sin normalizar'}</span>
     </div>
     <div className="cotipl-conditions">
      <div><span>IVA</span><strong>{o.estadoIva==='incluido_explicito'?'Incluido expresamente':o.estadoIva==='excluido_explicito'?'No incluido expresamente':'No confirmado'}</strong></div>
      <div><span>Flete</span><strong>{o.estadoFlete==='monto_explicito'?'Monto especificado':o.estadoFlete==='a_convenir'?'A convenir':o.estadoFlete==='incluido_explicito'?'Incluido':'No confirmado'}</strong></div>
     </div>
    </>:<p className="cotipl-blocked">Oferta retenida hasta verificar la integridad y privacidad de todos los renglones.</p>}
    <footer className="cotipl-footer"><span>Propuesta anónima</span>
     <span>No implica adjudicación ni comparación económica</span></footer>
   </article>)}
  </div>
  <section className="cotipl-explain">
   <h2>Dos garantías, una presentación</h2>
   <p>La redacción comercial de cada renglón permanece literal. Solo se ocultan los datos que identifican al negocio, tras revisión de privacidad. Si un renglón con importe no puede mostrarse de forma segura, se retiene toda la oferta: nunca se publica un presupuesto recortado.</p>
   <p>La vista todavía es un ensayo técnico con datos ficticios. La conexión a documentos reales PDF, Excel e imágenes requiere extracción y verificación adicional.</p>
  </section>
 </div></main>;
}
