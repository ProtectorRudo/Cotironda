/** MVP132: fail closed before invoking internal recovery. */
const SECRET=/^[a-f0-9]{96}$/u;
const respond=(status:number,state:string)=>new Response(JSON.stringify({state}),{
 status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff'}
});
export async function guardScheduledRecovery(req:Request,args:{
 enabled:boolean;
 authorize:(token:string)=>Promise<boolean>;
 run:()=>Promise<Response>;
}):Promise<Response>{
 const header=req.headers.get('x-cotironda-recovery-token')??'';
 if(!SECRET.test(header))return respond(401,'unauthorized');
 if(req.method!=='POST')return respond(405,'method_not_allowed');
 const declared=req.headers.get('content-length');
 if(declared!==null&&(!/^\d{1,3}$/u.test(declared)||Number(declared)>64))
  return respond(413,'body_too_large');
 try{
  if(!args.enabled)return respond(503,'worker_off');
  if(!await args.authorize(header))return respond(401,'unauthorized');
  return await args.run();
 }catch{return respond(503,'temporarily_unavailable')}
}
