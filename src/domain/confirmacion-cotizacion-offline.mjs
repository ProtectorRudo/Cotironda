/**
 * D046 — ciclo de cotización por conversación, sólo DOMINIO OFFLINE.
 * No escucha Whapi, no conecta DB, no interpreta IA ni envía mensajes.
 * El broker FUTURO debe autenticar y persistir cada evento antes de llamarnos.
 */
import { createHash } from 'node:crypto';
import { compararCotizacionesOffline } from './comparacion-ofertas.ts';

const HEX=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const CHAN=/^[A-Za-z0-9_-]{4,64}$/;
const ANON=/^anon_[a-z0-9_]{3,44}$/;
const IDENT=/^[a-z][a-z0-9_]{2,49}$/;
const UNIDADES=new Set(['unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack']);
const DINERO=/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/;
const exact=(o,keys)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
  Object.keys(o).length===keys.length&&Object.keys(o).every(k=>keys.includes(k));
const fail=()=>{throw new TypeError('D046_ENTRADA_NO_VERIFICADA')};
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const freeze=x=>{
  if(x&&typeof x==='object'){
    for(const y of Object.values(x))freeze(y);
    Object.freeze(x);
  }
  return x;
};
/** Vinculación ya resuelta por servidor; nunca tomar identificadores del cuerpo WhatsApp. */
export function iniciarCotizacionChatD046(vinculo,pedido,etiquetas=null){
  if(!exact(vinculo,['channelId','chatHmac','supplierOrgId','roundId','anonId'])||
     !CHAN.test(vinculo.channelId)||!HEX.test(vinculo.chatHmac)||
     !UUID.test(vinculo.supplierOrgId)||!UUID.test(vinculo.roundId)||
     !ANON.test(vinculo.anonId)||
     !exact(pedido,['items'])||!Array.isArray(pedido.items)||
     !pedido.items.length||pedido.items.length>8)fail();
  const ids=new Set();
  for(const item of pedido.items){
    if(!exact(item,['id','cantidad','unidad'])||!IDENT.test(item.id)||
      ids.has(item.id)||!UNIDADES.has(item.unidad))fail();
    ids.add(item.id);
  }
  // Los nombres son de un catálogo/backend confiable, no del mensaje del proveedor.
  if(etiquetas!==null&&(!exact(etiquetas,pedido.items.map(x=>x.id))||
    Object.values(etiquetas).some(v=>typeof v!=='string'||v.trim().length<3||
      v.length>120||/[\u0000-\u001f]/.test(v))))fail();
  const nombres=etiquetas?{...etiquetas}:Object.fromEntries(
    pedido.items.map((x,i)=>[x.id,'Artículo '+(i+1)]));
  // Usamos el comparador existente para validar también cantidades estrictas.
  compararCotizacionesOffline(pedido,[]);
  return freeze({estado:'sin_borrador',vinculo:{...vinculo},etiquetas:nombres,
    pedido:{items:pedido.items.map(i=>({...i}))},
    procesados:[],borrador:null,confirmadas:[]});
}
/**
 * evento es una constancia INTERNA del receptor/ledger, no input de WhatsApp.
 * messageKey HMAC proviene del broker; el contenido está almacenado cifrado.
 */
function verificarEvento(sesion,evento){
  if(!exact(evento,['channelId','chatHmac','supplierOrgId','roundId',
     'messageKey','persistido','vinculoVerificado','consentimientoVigente',
     'invitacionVigente','rondaAbierta','tipo']))fail();
  const v=sesion?.vinculo;
  if(!v||evento.channelId!==v.channelId||evento.chatHmac!==v.chatHmac||
    evento.supplierOrgId!==v.supplierOrgId||evento.roundId!==v.roundId||
    !HEX.test(evento.messageKey)||evento.persistido!==true||
    evento.vinculoVerificado!==true||evento.consentimientoVigente!==true||
    evento.invitacionVigente!==true||evento.rondaAbierta!==true||
    evento.tipo!=='text')fail();
}
function repetido(sesion,eventKey,huella){
  const previo=sesion.procesados.find(e=>e.messageKey===eventKey);
  if(!previo)return false;
  if(previo.huella!==huella)fail();
  return true;
}
function agregarProcesado(sesion,evento,huella){
  if(sesion.procesados.length>=128)fail(); // el ledger durable debe limpiar por política
  return [...sesion.procesados,{messageKey:evento.messageKey,huella}];
}
function validarPropuesta(sesion,propuesta){
  if(!exact(propuesta,['moneda','formaPago','plazoEntregaDias',
      'fleteFinal','minimoCompraFinal','items'])||!Array.isArray(propuesta.items)||
      !propuesta.items.length||propuesta.items.length>8)fail();
  const ids=new Map(sesion.pedido.items.map(x=>[x.id,x]));
  const vistos=new Set();
  for(const item of propuesta.items){
    if(!exact(item,['itemId','unidad','cantidadDisponible','precioUnitarioNeto','ivaPorcentaje'])||
      !ids.has(item.itemId)||vistos.has(item.itemId)||
      item.unidad!==ids.get(item.itemId).unidad)fail();
    vistos.add(item.itemId);
  }
  // Esta conversión NO acepta equivalencia propuesta por una IA.
  // Todo precio confirmado queda técnicamente SIN VERIFICAR.
  const oferta={
    anonId:sesion.vinculo.anonId,version:sesion.confirmadas.length+1,
    confirmada:false,moneda:propuesta.moneda,formaPago:propuesta.formaPago,
    plazoEntregaDias:propuesta.plazoEntregaDias,fleteFinal:propuesta.fleteFinal,
    minimoCompraFinal:propuesta.minimoCompraFinal,
    items:propuesta.items.map(i=>({...i,equivalencia:'sin_verificar'}))
  };
  compararCotizacionesOffline(sesion.pedido,[oferta]); // esquema + decimales exactos
  const faltantes=[];
  if(oferta.formaPago===null)faltantes.push('forma de pago');
  if(oferta.plazoEntregaDias===null)faltantes.push('plazo de entrega');
  if(oferta.fleteFinal===null)faltantes.push('flete');
  if(oferta.minimoCompraFinal===null)faltantes.push('compra mínima');
  for(const i of oferta.items){
    if(i.precioUnitarioNeto===null)faltantes.push('precio de '+i.itemId);
    if(i.ivaPorcentaje===null)faltantes.push('IVA de '+i.itemId);
  }
  return {oferta,faltantes};
}
/** El intérprete de texto/archivo/IA entrega únicamente propuesta estructurada. */
export function prepararBorradorCotizacionD046(sesion,evento,propuesta){
  verificarEvento(sesion,evento);
  // Validar ANTES de registrar el evento. Una propuesta inválida no borra oferta anterior.
  const {oferta,faltantes}=validarPropuesta(sesion,propuesta);
  const huella=sha(['propuesta',evento,propuesta]);
  if(repetido(sesion,evento.messageKey,huella))return sesion;
  const draftId=sha([sesion.vinculo.roundId,sesion.vinculo.supplierOrgId,
    evento.messageKey,oferta.version,oferta.items,oferta.fleteFinal,
    oferta.minimoCompraFinal,oferta.formaPago,oferta.plazoEntregaDias]).slice(0,16);
  const codigo=draftId.slice(0,6).toUpperCase();
  const detalles=oferta.items.map(i=>sesion.etiquetas[i.itemId]+': '+i.cantidadDisponible+
    ' '+i.unidad+', $'+(i.precioUnitarioNeto??'SIN PRECIO')+
    ' netos por unidad, IVA '+(i.ivaPorcentaje??'SIN INFORMAR')+'%');
  const resumen='Preparé este borrador (todavía NO está confirmado):\n'+
    detalles.join('\n')+'\nFlete: '+(oferta.fleteFinal??'sin informar')+
    ' | Compra mínima: '+(oferta.minimoCompraFinal??'sin informar')+
    ' | Pago: '+(oferta.formaPago??'sin informar')+
    ' | Entrega: '+(oferta.plazoEntregaDias===null?'sin informar':oferta.plazoEntregaDias+' días');
  const textoProveedor=faltantes.length
    ?resumen+'\nPara confirmar, falta aclarar: '+faltantes.join(', ')+'.'
    :resumen+'\n¿Está correcto? Respondé a ESTE mensaje con "Confirmo",'+
      ' o escribí "Confirmo '+codigo+'". Si querés corregir algo, enviá la corrección.';
  return freeze({
    ...sesion,estado:'pendiente_confirmacion',
    procesados:agregarProcesado(sesion,evento,huella),
    borrador:{draftId,codigo,oferta,faltantes,textoProveedor,
      sourceMessageKey:evento.messageKey}
  });
}
/**
 * Para "Confirmo" a secas hace falta reply-to del mensaje saliente verificado
 * y resuelto por el broker a draftId. Alternativa: "Confirmo CÓDIGO".
 */
export function confirmarBorradorCotizacionD046(sesion,evento,confirmacion){
  verificarEvento(sesion,evento);
  if(!exact(confirmacion,['texto','replyToDraftId'])||
    typeof confirmacion.texto!=='string'||confirmacion.texto.length>60||
    !(confirmacion.replyToDraftId===null||
      typeof confirmacion.replyToDraftId==='string'&&
      /^[a-f0-9]{16}$/.test(confirmacion.replyToDraftId)))fail();
  const huella=sha(['confirmacion',evento,confirmacion]);
  if(repetido(sesion,evento.messageKey,huella))return sesion;
  const b=sesion.borrador;
  if(!b||sesion.estado!=='pendiente_confirmacion')fail();
  const txt=confirmacion.texto.trim().toLocaleUpperCase('es-AR');
  if(!((txt==='CONFIRMO'&&confirmacion.replyToDraftId===b.draftId)||
     (txt==='CONFIRMO '+b.codigo&&
        (confirmacion.replyToDraftId===null||confirmacion.replyToDraftId===b.draftId))))fail();
  if(b.faltantes.length)fail();
  const aprobada={...b.oferta,confirmada:true};
  // Todavía "sin_verificar": NO comparar precio sin revisión técnica independiente.
  const version={draftId:b.draftId,confirmMessageKey:evento.messageKey,oferta:aprobada};
  return freeze({...sesion,estado:'oferta_confirmada',borrador:null,
    confirmadas:[...sesion.confirmadas,version],
    procesados:agregarProcesado(sesion,evento,huella)});
}
export function ultimaOfertaConfirmadaD046(sesion){
  return sesion.confirmadas.at(-1)?.oferta??null;
}
