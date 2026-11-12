/** Cotironda V2 — calendario operado por IA Central con evidencia externa.
 * Los modelos pueden descubrir/interpretar normas; NUNCA inventan fechas
 * ni calculan un vencimiento económico/contractual con lenguaje libre.
 * Este evaluador NO escribe SQL, no envía Whapi y no modifica rondas.
 */
export type FeriadoNormalizadoV2=Readonly<{
 fecha:string;nombre:string;
 tipo:'inamovible'|'trasladable'|'feriado_nacional'|
  'puente'|'no_laborable'|'feriado_local_obligatorio'|
  'feriado_local_optativo';
}>;
export type FuenteAnualV2=Readonly<{
 url:string;anio:number;cobertura:'anual_completa';
 feriados:readonly FeriadoNormalizadoV2[];
}>;
export type FuentesAnoCalendarioV2=Readonly<{
 gobierno:FuenteAnualV2;contraste:FuenteAnualV2;
 locales:Readonly<{cobertura:'anual_completa';
  fuente:string;feriados:readonly FeriadoNormalizadoV2[]}>;
}>;
export type PeticionCalendarioCentralV2=Readonly<{
 fechaCreacionISO:string;localidad:string;anio:number;
 gobierno:FuenteAnualV2;contraste:FuenteAnualV2;
 locales:FuentesAnoCalendarioV2['locales'];
 siguienteAnio?:FuentesAnoCalendarioV2;
 reglaOptativos:'contar_como_habiles'|'excluir_solo_si_adheridos';
 adhesionOptativosConfirmada:boolean;
}>;
export type DecisionCalendarioCentralV2=Readonly<{
 estado:'vencimiento_verificable'|'revision_automatica';
 codigo:string;venceISO:string|null;venceLocal:string|null;
 feriadosExcluidos:readonly string[];
 diasOptativosNoExcluidos:readonly string[];
 trazabilidad:readonly string[];
 escrituraDB:false;whatsappEnviado:false;
}>;
const CLOSED=new Set(['inamovible','trasladable','feriado_nacional',
 'feriado_local_obligatorio']);
const OPTIONAL=new Set(['puente','no_laborable','feriado_local_optativo']);
const DATE=/^\d{4}-\d{2}-\d{2}$/u;
function dateValid(s:string):boolean{
 if(!DATE.test(s))return false;
 const d=new Date(s+'T00:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
}
function obj(x:unknown):x is Record<string,unknown>{
 return !!x&&typeof x==='object'&&!Array.isArray(x);
}
const deny=(codigo:string,trazabilidad:readonly string[]=[]):
 DecisionCalendarioCentralV2=>Object.freeze({
 estado:'revision_automatica',codigo,venceISO:null,venceLocal:null,
 feriadosExcluidos:[],diasOptativosNoExcluidos:[],
 trazabilidad,escrituraDB:false,whatsappEnviado:false
});
function urlTrusted(value:string,source:'gobierno'|'contraste'|'local'):boolean{
 try{
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return false;
  if(source==='gobierno')
   return ['datos.gob.ar','www.datos.gob.ar','argentina.gob.ar',
    'www.argentina.gob.ar'].includes(u.hostname);
  if(source==='contraste')
   return ['api.argentinadatos.com','www.bcra.gob.ar',
    'bcra.gob.ar'].includes(u.hostname);
  return ['normas.gba.gob.ar','www.argentina.gob.ar',
   'argentina.gob.ar','www.boletinoficial.gob.ar'].includes(u.hostname);
 }catch{return false}
}
function normalize(source:FuenteAnualV2,year:number,role:'gobierno'|'contraste'):
 Readonly<{obligatorios:Set<string>;optativos:Set<string>}>|null{
 if(!obj(source)||source.anio!==year||source.cobertura!=='anual_completa'||
  !urlTrusted(source.url,role)||!Array.isArray(source.feriados)||
  source.feriados.length<8||source.feriados.length>200)return null;
 const seen=new Map<string,string>(),closed=new Set<string>(),
  optional=new Set<string>();
 for(const h of source.feriados){
  if(!obj(h)||typeof h.fecha!=='string'||!dateValid(h.fecha)||
   Number(h.fecha.slice(0,4))!==year||
   typeof h.nombre!=='string'||h.nombre.trim().length<3||
   h.nombre.length>160||typeof h.tipo!=='string'||
   !CLOSED.has(h.tipo)&&!OPTIONAL.has(h.tipo))return null;
  if(seen.has(h.fecha))return null;
  seen.set(h.fecha,h.tipo);
  (CLOSED.has(h.tipo)?closed:optional).add(h.fecha);
 }
 if(closed.size<8)return null;
 return {obligatorios:closed,optativos:optional};
}
function localSources(
 args:Readonly<{locales:FuentesAnoCalendarioV2['locales'];anio:number}>,
):{closed:Set<string>;optional:Set<string>}|null{
 if(!args.locales||args.locales.cobertura!=='anual_completa'||
  !urlTrusted(args.locales.fuente,'local')||
  !Array.isArray(args.locales.feriados)||args.locales.feriados.length>100)
  return null;
 const closed=new Set<string>(),optional=new Set<string>();
 for(const holiday of args.locales.feriados){
  if(!obj(holiday)||typeof holiday.fecha!=='string'||
   !dateValid(holiday.fecha)||Number(holiday.fecha.slice(0,4))!==args.anio||
   typeof holiday.nombre!=='string'||holiday.nombre.trim().length<3||
   !['feriado_local_obligatorio','feriado_local_optativo'].includes(holiday.tipo)||
   closed.has(holiday.fecha)||optional.has(holiday.fecha))return null;
  (holiday.tipo==='feriado_local_obligatorio'?closed:optional).add(holiday.fecha);
 }
 return {closed,optional};
}
function localDate(date:Date):string{
 const parts=new Intl.DateTimeFormat('en-GB',{
  timeZone:'America/Argentina/Buenos_Aires',year:'numeric',
  month:'2-digit',day:'2-digit'
 }).formatToParts(date);
 const field=(name:string)=>parts.find(x=>x.type===name)?.value??'';
 return field('year')+'-'+field('month')+'-'+field('day');
}
function sameSet(a:Set<string>,b:Set<string>):boolean{
 return a.size===b.size&&[...a].every(x=>b.has(x));
}
/** La IA Central llama con dos lecturas de fuentes independientes, y
 * solamente el motor determinista devuelve 18:00 hora Buenos Aires.
 * Una contradicción se revisa internamente sin pedirle nada al cliente.
 */
export function decidirVencimientoCentralV2(args:PeticionCalendarioCentralV2):
 DecisionCalendarioCentralV2{
 if(!obj(args)||typeof args.localidad!=='string'||
  args.localidad.trim().length<3||args.localidad.length>80||
  !Number.isInteger(args.anio)||args.anio<2026||args.anio>2100||
  !['contar_como_habiles','excluir_solo_si_adheridos'].includes(args.reglaOptativos)||
  typeof args.adhesionOptativosConfirmada!=='boolean')
  return deny('parametros_invalidos');
 const start=new Date(args.fechaCreacionISO);
 if(!Number.isFinite(start.getTime())||
  !/^\d{4}-\d\d-\d\dT/u.test(args.fechaCreacionISO))
  return deny('fecha_invalida');
 const from=localDate(start);
 if(!dateValid(from)||Number(from.slice(0,4))!==args.anio)
  return deny('anio_o_huso_invalido');
 const a=normalize(args.gobierno,args.anio,'gobierno');
 const b=normalize(args.contraste,args.anio,'contraste');
 if(!a||!b)return deny('fuentes_nacionales_incompletas_o_no_autorizadas');
 if(!sameSet(a.obligatorios,b.obligatorios))
  return deny('discrepancia_entre_fuentes_nacionales',[
   args.gobierno.url,args.contraste.url]);
 const local=localSources(args);
 if(!local)return deny('cobertura_local_no_acreditada');
 const excluding=new Set([...a.obligatorios,...local.closed]);
 const optional=new Set([...a.optativos,...b.optativos,...local.optional]);
 const honorOptional=args.reglaOptativos==='excluir_solo_si_adheridos'&&
  args.adhesionOptativosConfirmada;
 if(honorOptional)for(const d of optional)excluding.add(d);
 const current=new Date(from+'T12:00:00Z');
 const nextInfo=args.siguienteAnio;
 let next:Readonly<{
  excluding:Set<string>;optional:Set<string>;
  urls:readonly string[];
 }> | null=null;
 if(nextInfo){
  const year=args.anio+1;
  const a2=normalize(nextInfo.gobierno,year,'gobierno');
  const b2=normalize(nextInfo.contraste,year,'contraste');
  const l2=localSources({anio:year,locales:nextInfo.locales});
  if(!a2||!b2||!l2||!sameSet(a2.obligatorios,b2.obligatorios))
   return deny('fuentes_anio_siguiente_no_conciliadas');
  const excluded=new Set([...a2.obligatorios,...l2.closed]);
  const opt=new Set([...a2.optativos,...b2.optativos,...l2.optional]);
  if(honorOptional)for(const day of opt)excluded.add(day);
  next={excluding:excluded,optional:opt,
   urls:[nextInfo.gobierno.url,nextInfo.contraste.url,nextInfo.locales.fuente]};
 }
 let count=0;
 for(let offset=1;offset<=35;offset++){
  const next=new Date(current.getTime()+offset*86400000);
  const day=next.toISOString().slice(0,10);
  const following=Number(day.slice(0,4))===args.anio+1;
  if(following&&!next)
   return deny('calendario_anio_siguiente_no_conciliado');
  if(Number(day.slice(0,4))>args.anio+1)
   return deny('calendario_horizonte_excedido');
  const excluded=following?next!.excluding:excluding;
  if(next.getUTCDay()===0||next.getUTCDay()===6||excluded.has(day))continue;
  count++;
  if(count===2){
   const utc=new Date(day+'T21:00:00Z');
   if(localDate(utc)!==day)return deny('zona_horaria_no_verificada');
   return Object.freeze({
    estado:'vencimiento_verificable',codigo:'dos_dias_habiles',
    venceISO:utc.toISOString(),venceLocal:day+' 18:00',
    feriadosExcluidos:Object.freeze([...excluding,
     ...(next?.excluding??[])].sort()),
    diasOptativosNoExcluidos:Object.freeze([...optional,
     ...(next?.optional??[])].filter(x=>!
     excluding.has(x)&&!(next?.excluding.has(x)??false)).sort()),
    trazabilidad:Object.freeze([args.gobierno.url,args.contraste.url,
     args.locales.fuente,...(next?.urls??[])]),
    escrituraDB:false,whatsappEnviado:false
   });
  }
 }
 return deny('calendario_insuficiente');
}
