/** MVP314: bounded, independent continuation of already-published IA Central jobs.
 * No WhatsApp or DB credentials here: dependencies are injected by the private Edge.
 * The SQL claim (not this coordinator) enforces the durable UTC daily budget.
 */
const UUID314=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
type Rpc314=(name:string,params:Record<string,unknown>)=>
 Promise<Readonly<{data:unknown;error:unknown}>>;
export type Dispatch314=Readonly<{estado:
 'inactivo'|'sin_trabajos'|'terminado'|'limite_diario'|'requiere_conciliacion';
 reclamados:number;apiAceptados:number;inciertos:number}>;
export type Batch314=Readonly<{estado:
 'inactivo'|'sin_trabajos'|'procesado'|'limite_diario'|'requiere_conciliacion';
 reclamados:number;apiAceptados:number;inciertos:number}>;
const record=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==='object'&&!Array.isArray(x);
/** At most TWO independently leased jobs per invocation. Never loops indefinitely. */
export async function continuarDespachoMvp314(args:{
 enabled:boolean;rpc:Rpc314;
 dispatch:(requestId:string)=>Promise<Dispatch314>;
}):Promise<Batch314>{
 const output=(estado:Batch314['estado'],n:number,a:number,u:number):Batch314=>
  ({estado,reclamados:n,apiAceptados:a,inciertos:u});
 if(!args.enabled)return output('inactivo',0,0,0);
 if(typeof args.rpc!=='function'||typeof args.dispatch!=='function')
  return output('requiere_conciliacion',0,0,0);
 let claimed=0,accepted=0,uncertain=0;
 for(let i=0;i<2;i++){
  let choice:Readonly<{data:unknown;error:unknown}>;
  try{choice=await args.rpc('cotironda_piloto_ia_next_batch_mvp314',{})}
  catch{return output('requiere_conciliacion',claimed,accepted,uncertain)}
  if(choice.error||!record(choice.data))
   return output('requiere_conciliacion',claimed,accepted,uncertain);
  if(choice.data.state==='disabled')return output('inactivo',claimed,accepted,uncertain);
  if(choice.data.state==='budget_exhausted')
   return output('limite_diario',claimed,accepted,uncertain);
  if(choice.data.state==='empty')
   return output(claimed?'procesado':'sin_trabajos',claimed,accepted,uncertain);
  if(choice.data.state!=='ready'||typeof choice.data.request_id!=='string'||
     !UUID314.test(choice.data.request_id))
   return output('requiere_conciliacion',claimed,accepted,uncertain);
  let r:Dispatch314;
  try{r=await args.dispatch(choice.data.request_id)}
  catch{return output('requiere_conciliacion',claimed,accepted,uncertain)}
  if(!r||!Number.isSafeInteger(r.reclamados)||r.reclamados<0||
     r.reclamados>1||!Number.isSafeInteger(r.apiAceptados)||
     !Number.isSafeInteger(r.inciertos)||
     r.apiAceptados+r.inciertos!==r.reclamados)
   return output('requiere_conciliacion',claimed,accepted,uncertain);
  claimed+=r.reclamados;accepted+=r.apiAceptados;uncertain+=r.inciertos;
  if(r.estado==='requiere_conciliacion')
   return output('requiere_conciliacion',claimed,accepted,uncertain);
  if(r.estado==='limite_diario')return output('limite_diario',claimed,accepted,uncertain);
  if(r.estado==='inactivo')return output('inactivo',claimed,accepted,uncertain);
  if(r.estado==='sin_trabajos'&&r.reclamados===0)
   return output(claimed?'procesado':'sin_trabajos',claimed,accepted,uncertain);
  if(r.estado!=='terminado')
   return output('requiere_conciliacion',claimed,accepted,uncertain);
 }
 return output('procesado',claimed,accepted,uncertain);
}
