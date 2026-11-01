/**
 * D027 · Receptor Whapi OFFLINE: sin endpoint ni cliente Whapi conectado.
 * La autenticidad depende de un encabezado personalizado configurado en Whapi,
 * por canal, sobre HTTPS. No atribuirle firma HMAC que Whapi no garantizó.
 *
 * ¡La integración debe implementar resolver + persistir en backend transaccional!
 * Este archivo NO interpreta mensajes ni confirma ofertas económicas.
 */
import {createHash,timingSafeEqual} from 'node:crypto';

const MAX_BODY=65536;
const MAX_BATCH=10;
const CHANNEL=/^[a-zA-Z0-9_-]{4,64}$/;
const PHONE=/^[1-9][0-9]{7,16}$/;
const MESSAGE=/^[a-zA-Z0-9._:-]{8,160}$/;
// Contexto de cita Whapi.Cloud, nunca autenticación por sí mismo.
const QUOTED=/^[a-zA-Z0-9._:-]{8,160}$/;
const ACCEPTED=new Set(['text','image','document','audio','voice']);

export type VinculoProveedorVerificado=Readonly<{
  supplierOrgId:string;roundId:string;consentimientoVigente:boolean;
  invitacionVigente:boolean;
}>;
export type MensajeEntrantePendiente=Readonly<{
  canalId:string;chatId:string;mensajeId:string;proveedorOrgId:string;
  rondaId:string;tipo:'text'|'image'|'document'|'audio'|'voice';
  texto:string|null;marcaTiempoUnix:number;
  quotedMessageId?:string;
  huellaSha256:string;claveIdempotencia:string;
  estado:'pendiente_interpretacion';
}>;

/** Buyer identity is resolved ONLY by the private HMAC chat binding. */
export type VinculoCompradorVerificado=Readonly<{
  buyerOrgId:string;
  consentimientoContactoVigente:boolean;
  chatHabilitado:boolean;
}>;
export type MensajeCompradorPendiente=Readonly<{
  canalId:string;chatId:string;mensajeId:string;compradorOrgId:string;
  tipo:'text'|'image'|'document'|'audio'|'voice';
  texto:string|null;marcaTiempoUnix:number;
  quotedMessageId?:string;
  huellaSha256:string;claveIdempotencia:string;
  estado:'pendiente_interpretacion';
}>;
export type DependenciasWhapiEntrada={
  habilitado:boolean;
  canalId:string;
  secretoWebhook:string;
  ahoraUnix:()=>number;
  resolverProveedor:(canalId:string,chatId:string)=>Promise<VinculoProveedorVerificado|null>;
  persistirEntrada:(entrada:MensajeEntrantePendiente)=>Promise<'guardada'|'duplicada'>;
  // Optional pair for the buyer route. MUST point to a trusted private,
  // durable encrypted inbox; never directly to a browser or body-supplied ID.
  resolverComprador?:(canalId:string,chatId:string)=>
    Promise<VinculoCompradorVerificado|null>;
  persistirEntradaComprador?:(entrada:MensajeCompradorPendiente)=>
    Promise<'guardada'|'duplicada'>;
  registrarBajaComprador?:(canalId:string,chatId:string,mensajeId:string,
    huellaSha256:string,marcaTiempoUnix:number)=>
    Promise<'registrada'|'duplicada'>;
  // BAJA no depende de invitación ni opt-in vigente, pero sí de vínculo verificado.
  registrarBaja?:(canalId:string,chatId:string,mensajeId:string,
    huellaSha256:string,marcaTiempoUnix:number)=>Promise<'registrada'|'duplicada'>;
  // D072 voluntary onboarding works BEFORE first invitation. The callback
  // only fires after exact webhook authentication and direct-chat validation.
  registrarAlta?:(canalId:string,chatId:string,mensajeId:string,
    texto:string,marcaTiempoUnix:number)=>Promise<'registrada'|'duplicada'>;
};
function resultado(status:number,data:Record<string,unknown>={}):Response{
  return new Response(status===204?null:JSON.stringify(data),{
    status,headers:{'Cache-Control':'no-store, no-cache, max-age=0',
      'X-Content-Type-Options':'nosniff',...(status===204?{}:
        {'Content-Type':'application/json; charset=utf-8'})}
  });
}
function objeto(x:unknown):x is Record<string,unknown>{
  return !!x&&typeof x==='object'&&!Array.isArray(x);
}
function seguro(a:string,b:string):boolean{
  const x=Buffer.from(a,'utf8'),y=Buffer.from(b,'utf8');
  return x.length===y.length&&timingSafeEqual(x,y);
}
async function leerJsonAcotado(req:Request):Promise<unknown>{
  const len=req.headers.get('content-length');
  if(len!==null&&(!/^\d+$/.test(len)||Number(len)>MAX_BODY))
    throw new RangeError('payload_demasiado_grande');
  if(!req.body)throw new TypeError('payload_ausente');
  const reader=req.body.getReader();
  const chunks:Uint8Array[]=[];
  let bytes=0;
  try{
    while(true){
      const r=await reader.read();
      if(r.done)break;
      bytes+=r.value.byteLength;
      if(bytes>MAX_BODY){await reader.cancel();throw new RangeError('payload_demasiado_grande');}
      chunks.push(r.value);
    }
  }finally{reader.releaseLock()}
  const buf=Buffer.concat(chunks.map(x=>Buffer.from(x)),bytes);
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buf));
}
type Candidato={
  mensajeId:string;chatId:string;tipo:MensajeEntrantePendiente['tipo'];
  texto:string|null;marcaTiempoUnix:number;quotedMessageId?:string;
};
function extraer(x:unknown,ahora:number):Candidato|null{
  if(!objeto(x))throw new TypeError('mensaje_invalido');
  if(x.from_me===true)return null;
  if(x.from_me!==false)throw new TypeError('origen_de_mensaje_no_verificado');
  if(typeof x.chat_id!=='string')throw new TypeError('chat_invalido');
  // Solo mensajes de chat directo; no @g.us, @lid, broadcast ni grupos.
  const match=/^([1-9][0-9]{7,16})@s\.whatsapp\.net$/.exec(x.chat_id);
  if(!match)return null;
  if(!PHONE.test(match[1])||x.from!==match[1])throw new TypeError('remitente_incoherente');
  if(typeof x.type!=='string'||!ACCEPTED.has(x.type))return null;
  if(typeof x.id!=='string'||!MESSAGE.test(x.id))throw new TypeError('mensaje_id_invalido');
  if(typeof x.timestamp!=='number'||!Number.isSafeInteger(x.timestamp)||
     x.timestamp<ahora-172800||x.timestamp>ahora+300)
    throw new TypeError('mensaje_fecha_invalida');
  const tipo=x.type as Candidato['tipo'];
  let texto:string|null=null;
  if(tipo==='text'){
    if(!objeto(x.text)||typeof x.text.body!=='string'||
      x.text.body.trim().length===0||x.text.body.length>3000)
       throw new TypeError('mensaje_texto_invalido');
    texto=x.text.body.trim();
  }
  // D050: sólo el ID del mensaje citado, jamás quoted_content/quoted_author.
  // No transformamos un ID de Whapi en referencia autorizada; el broker debe
  // cruzarlo luego con el acuse HMAC del outbox del MISMO contacto y ronda.
  let quotedMessageId:string|undefined;
  if(x.context!==undefined){
    if(!objeto(x.context))throw new TypeError('contexto_cita_invalido');
    const quoted=x.context.quoted_id;
    if(quoted!==undefined&&quoted!==null){
      if(tipo!=='text'||typeof quoted!=='string'||!QUOTED.test(quoted))
        throw new TypeError('contexto_cita_invalido');
      quotedMessageId=quoted;
    }
  }
  // Media: no leer links, captions, URLs ni datos base64.
  // Descargar, antivirus, tamaño y almacenamiento seguro = iteración posterior.
  return {mensajeId:x.id,chatId:x.chat_id,tipo,texto,marcaTiempoUnix:x.timestamp,
    ...(quotedMessageId?{quotedMessageId}:{})};
}
function uuid(x:unknown):x is string{
  return typeof x==='string'&&
    /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(x);
}
export async function procesarWebhookWhapiAislado(
  req:Request,dep:DependenciasWhapiEntrada
):Promise<Response>{
  // Desactivado por defecto. Ninguna ruta publica monta este procesador.
  if(!dep.habilitado)return resultado(503,{error:'integracion_no_habilitada'});
  if(req.method!=='POST')return resultado(405,{error:'metodo_no_permitido'});
  if(!CHANNEL.test(dep.canalId)||typeof dep.secretoWebhook!=='string'||
    dep.secretoWebhook.length<32||dep.secretoWebhook.length>256)
    return resultado(503,{error:'integracion_no_configurada'});
  const header=req.headers.get('x-cotironda-webhook-key')??'';
  if(!seguro(header,dep.secretoWebhook))
    return resultado(401,{error:'origen_no_autorizado'});
  if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')??''))
    return resultado(415,{error:'formato_no_admitido'});
  let raw:unknown;
  try{raw=await leerJsonAcotado(req)}
  catch(e){return resultado(e instanceof RangeError?413:400,{error:'cuerpo_invalido'})}
  if(!objeto(raw)||!objeto(raw.event))return resultado(400,{error:'evento_invalido'});
  if(raw.channel_id!==dep.canalId)return resultado(403,{error:'canal_no_autorizado'});
  if(raw.event.type!=='messages'||raw.event.event!=='post')return resultado(204);
  if(!Array.isArray(raw.messages)||raw.messages.length===0||
    raw.messages.length>MAX_BATCH)return resultado(422,{error:'lote_invalido'});
  const ahora=dep.ahoraUnix();
  if(!Number.isSafeInteger(ahora)||ahora<1)
    return resultado(503,{error:'reloj_no_disponible'});
  let candidatos:Candidato[];
  try{candidatos=raw.messages.map(x=>extraer(x,ahora))
    .filter((x):x is Candidato=>x!==null)}
  catch{return resultado(422,{error:'mensaje_no_admitido'})}
  if(!candidatos.length)return resultado(204);
  // Rechazar colisiones dentro del mismo lote: ni duplicar ni aceptar variaciones
  // en una misma llamada. Retransmisiones entre requests quedan a cargo del sink.
  const ids=new Set<string>();
  for(const c of candidatos){
    if(ids.has(c.mensajeId))return resultado(422,{error:'lote_duplicado'});
    ids.add(c.mensajeId);
  }
  // Resolver desde datos verificados del servidor, nunca del body de Whapi.
  // Los mensajes del lote se guardan de uno en uno. Si falla uno, HTTP 503
  // para reenvío completo; el sink transaccional debe deduplicar los ya guardados.
  let guardadas=0,duplicadas=0,bajasRegistradas=0,altasRegistradas=0;
  let compradoresGuardados=0;
  for(const c of candidatos){
    // BAJA explícita y exacta. No intentar interpretar intención ni ejecutar SQL
    // desde texto arbitrario; un broker verificará el chat y registrará la baja.
    if(c.tipo==='text'&&c.texto?.toLocaleUpperCase('es-AR')==='BAJA'){
      // Buyer BAJA is distinct from supplier BAJA, and the two bindings
      // cannot both be active. Legacy supplier-only behavior is preserved.
      if(dep.resolverComprador){
        let buyer:VinculoCompradorVerificado|null,supplier:VinculoProveedorVerificado|null;
        try{
          [buyer,supplier]=await Promise.all([
            dep.resolverComprador(dep.canalId,c.chatId),
            dep.resolverProveedor(dep.canalId,c.chatId)
          ]);
        }catch{return resultado(503,{error:'resolucion_no_disponible'})}
        if(buyer!==null){
          if(supplier!==null||!uuid(buyer.buyerOrgId)||
            !buyer.chatHabilitado||!buyer.consentimientoContactoVigente)
            return resultado(403,{error:'remitente_no_habilitado'});
          if(!dep.registrarBajaComprador)
            return resultado(503,{error:'bajas_no_configuradas'});
          const hash=createHash('sha256').update(JSON.stringify([
            dep.canalId,c.chatId,c.mensajeId,c.texto,c.marcaTiempoUnix,'BAJA_COMPRADOR'
          ])).digest('hex');
          try{
            const done=await dep.registrarBajaComprador(
              dep.canalId,c.chatId,c.mensajeId,hash,c.marcaTiempoUnix);
            if(done==='registrada')bajasRegistradas++;
            else if(done==='duplicada')duplicadas++;
            else throw Error('baja_comprador_invalida');
          }catch{return resultado(503,{error:'baja_no_disponible'})}
          continue;
        }
      }
      if(!dep.registrarBaja)return resultado(503,{error:'bajas_no_configuradas'});
      const hash=createHash('sha256').update(JSON.stringify([
        dep.canalId,c.chatId,c.mensajeId,c.texto,c.marcaTiempoUnix,'BAJA'
      ])).digest('hex');
      try{
        const done=await dep.registrarBaja(
          dep.canalId,c.chatId,c.mensajeId,hash,c.marcaTiempoUnix);
        if(done==='registrada')bajasRegistradas++;
        else if(done==='duplicada')duplicadas++;
        else throw new Error('respuesta_baja_invalida');
      }catch{return resultado(503,{error:'baja_no_disponible'})}
      continue;
    }
    // Voluntary first contact: no round/invitation exists yet. The
    // one-time code was issued to a logged-in supplier manager (D072).
    // Never interpret arbitrary inbound text as proof of opt-in.
    if(c.tipo==='text'&&/^COTI ALTA [a-f0-9]{32}$/u.test(c.texto??'')){
      if(!dep.registrarAlta)return resultado(503,{error:'alta_no_configurada'});
      try{
        const registered=await dep.registrarAlta(dep.canalId,c.chatId,
          c.mensajeId,c.texto!,c.marcaTiempoUnix);
        if(registered==='registrada')altasRegistradas++;
        else if(registered==='duplicada')duplicadas++;
        else throw new Error('alta_invalida');
      }catch{return resultado(503,{error:'alta_no_disponible'})}
      continue;
    }
    let vinculo:VinculoProveedorVerificado|null;
    let comprador:VinculoCompradorVerificado|null=null;
    try{
      [vinculo,comprador]=await Promise.all([
        dep.resolverProveedor(dep.canalId,c.chatId),
        dep.resolverComprador?dep.resolverComprador(dep.canalId,c.chatId):
          Promise.resolve(null)
      ]);
    }catch{return resultado(503,{error:'resolucion_no_disponible'})}
    if(vinculo!==null&&comprador!==null)
      return resultado(403,{error:'identidad_ambigua'});
    if(comprador!==null){
      if(!dep.persistirEntradaComprador||!uuid(comprador.buyerOrgId)||
        comprador.chatHabilitado!==true||
        comprador.consentimientoContactoVigente!==true)
        return resultado(403,{error:'remitente_no_habilitado'});
      const claveIdempotencia=createHash('sha256')
        .update(JSON.stringify([dep.canalId,c.mensajeId])).digest('hex');
      const huellaSha256=createHash('sha256')
        .update(JSON.stringify(['comprador',dep.canalId,c.mensajeId,c.chatId,
          c.tipo,c.texto,c.marcaTiempoUnix,comprador.buyerOrgId,
          ...(c.quotedMessageId?[c.quotedMessageId]:[])] )).digest('hex');
      try{
        const outcome=await dep.persistirEntradaComprador({
          canalId:dep.canalId,chatId:c.chatId,mensajeId:c.mensajeId,
          compradorOrgId:comprador.buyerOrgId,tipo:c.tipo,texto:c.texto,
          marcaTiempoUnix:c.marcaTiempoUnix,
          ...(c.quotedMessageId?{quotedMessageId:c.quotedMessageId}:{}),
          huellaSha256,claveIdempotencia,estado:'pendiente_interpretacion'
        });
        if(outcome==='guardada'){guardadas++;compradoresGuardados++;}
        else if(outcome==='duplicada')duplicadas++;
        else throw Error('resultado_invalido');
      }catch{return resultado(503,{error:'persistencia_no_disponible'})}
      continue;
    }
    if(!vinculo||!uuid(vinculo.supplierOrgId)||!uuid(vinculo.roundId)||
      !vinculo.consentimientoVigente||!vinculo.invitacionVigente)
       return resultado(403,{error:'remitente_no_habilitado'});
    const claveIdempotencia=createHash('sha256')
      .update(JSON.stringify([dep.canalId,c.mensajeId])).digest('hex');
    const huellaSha256=createHash('sha256')
      .update(JSON.stringify([dep.canalId,c.mensajeId,c.chatId,c.tipo,
        c.texto,c.marcaTiempoUnix,vinculo.supplierOrgId,vinculo.roundId,
        ...(c.quotedMessageId?[c.quotedMessageId]:[])] )).digest('hex');
    try{
      const result=await dep.persistirEntrada({
        canalId:dep.canalId,chatId:c.chatId,mensajeId:c.mensajeId,
        proveedorOrgId:vinculo.supplierOrgId,rondaId:vinculo.roundId,
        tipo:c.tipo,texto:c.texto,marcaTiempoUnix:c.marcaTiempoUnix,
        ...(c.quotedMessageId?{quotedMessageId:c.quotedMessageId}:{}),
        huellaSha256,claveIdempotencia,estado:'pendiente_interpretacion'
      });
      if(result==='guardada')guardadas++;
      else if(result==='duplicada')duplicadas++;
      else throw new Error('persistencia_invalida');
    }catch{
      return resultado(503,{error:'persistencia_no_disponible'});
    }
  }
  return resultado(200,{estado:'entradas_persistidas',guardadas,duplicadas,
    ...(compradoresGuardados>0?{compradoresGuardados}:{}),
    ...(bajasRegistradas>0?{bajasRegistradas}:{}),
    ...(altasRegistradas>0?{altasRegistradas}:{}),
    // Nunca 'cotizacion_recibida' ni 'precio_confirmado'.
    presupuestosConfirmados:0,mensajesEnviados:0});
}
