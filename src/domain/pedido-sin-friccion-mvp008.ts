/**
 * MVP-008: preparación del pedido en una sola interacción.
 * SOLO DEMO LOCAL: un comprador envía su lista; zona es el único dato
 * indispensable que preguntamos si no fue especificada ni proviene de perfil
 * ya validado. Nunca asumimos La Plata por defecto para el cliente.
 * Retorna mensajes simulados; no usa WhatsApp, IA, base ni red.
 */
import {generarVistaCompradorMvp,type VistaCompradorMvp} from './mvp-vista-comprador-d057.ts';

export type PreparacionPedidoMvp008=Readonly<{
  estado:'falta_zona_entrega';
  pregunta:'¿En qué localidad o zona entregamos los materiales?';
  zonasDetectadas:readonly string[];
}>|Readonly<{
  estado:'solicitudes_preparadas_sin_envio';
  zonaEntrega:string;
  origenZona:'pedido'|'perfil_confirmado'|'respuesta_comprador';
  vista:VistaCompradorMvp;
  consultas:readonly Readonly<{proveedorId:string;texto:string}>[];
  enviosWhatsapp:0;
}>;

const strip=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('es-AR').replace(/\s+/gu,' ').trim();
const zonaValida=(s:unknown):s is string=>typeof s==='string'&&s.trim().length>=3&&
  s.trim().length<=65&&/^[\p{L}\p{M}\d .,'-]+$/u.test(s.trim())&&
  !/(?:^|\s)(?:ignora|ignore|prompt|password|contraseña|https?|javascript)(?:$|\s)/iu.test(s);
const zonaId=(s:string)=>strip(s).replace(/[^a-z0-9]+/gu,'_').replace(/^_|_$/gu,'').slice(0,40);
const reZona=/^(?:(?:zona|localidad|direcci[oó]n)\s+de\s+entrega|entregar\s+en|entrega\s+en|destino)\s*:\s*(.+?)\s*[.!]?\s*$/iu;
export function prepararPedidoSinFriccionMvp008(args:Readonly<{
 texto:string;
 zonaPerfilConfirmada?:string|null;
 zonaRespondida?:string|null;
}>):PreparacionPedidoMvp008{
 if(!args||typeof args.texto!=='string'||!args.texto.trim()||
   args.texto.length>9000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(args.texto))
   throw new TypeError('mvp008_pedido_invalido');
 for(const val of [args.zonaPerfilConfirmada,args.zonaRespondida])
   if(val!==undefined&&val!==null&&!zonaValida(val))throw new TypeError('mvp008_zona_invalida');
 const lineas=args.texto.split(/\r\n|\n|\r/u).map(s=>s.trim()).filter(Boolean);
 const zonas:string[]=[];
 const materiales:string[]=[];
 for(const linea of lineas){
   const m=linea.match(reZona);
   if(m&&zonaValida(m[1]))zonas.push(m[1].trim());
   else materiales.push(linea);
 }
 if(!materiales.length)throw new TypeError('mvp008_materiales_ausentes');
 // Document zones take precedence, but conflicting explicit zones are NEVER guessed.
 const unicas=[...new Set(zonas.map(zonaId))];
 const zonaPedido=unicas.length===1?zonas[0]:null;
 const zona=args.zonaRespondida??(unicas.length>1?null:zonaPedido??args.zonaPerfilConfirmada??null);
 if(!zona)return Object.freeze({
   estado:'falta_zona_entrega' as const,
   pregunta:'¿En qué localidad o zona entregamos los materiales?' as const,
   zonasDetectadas:Object.freeze(zonas)
 });
 const origenZona=args.zonaRespondida?'respuesta_comprador':
   zonaPedido?'pedido':'perfil_confirmado';
 const vista=generarVistaCompradorMvp(materiales.join('\n'),zonaId(zona));
 const consultas=vista.proveedores.map(p=>{
   const condicion=vista.condicionIvaComprador==='con_iva'
     ?'\nDetalle solicitado: cotizá con IVA incluido en el importe final e indicá la condición.'
     :vista.condicionIvaComprador==='sin_iva'
       ?'\nDetalle solicitado: el comprador pidió importes sin IVA incluido; indicalo.'
       :'';
   return Object.freeze({
     proveedorId:p.id,
     texto:'Cotironda · Solicitud de cotización\n'+
       'Zona de entrega: '+zona.trim()+'\n'+
       'Materiales:\n'+p.items.map(s=>'• '+s).join('\n')+
       condicion+'\nRespondé con tu cotización por este chat. Si necesitás corregirla, enviá una versión nueva. No necesitás confirmar ni ingresar al portal.'
   });
 });
 const nombres=new Map(consultas.map(c=>[c.proveedorId,c.texto]));
 return Object.freeze({
   estado:'solicitudes_preparadas_sin_envio' as const,
   zonaEntrega:zona.trim(),origenZona,vista:{
     ...vista,proveedores:vista.proveedores.map(p=>({...p,
       mensajes:[nombres.get(p.id)!]}))
   },consultas:Object.freeze(consultas),
   enviosWhatsapp:0 as const
 });
}
