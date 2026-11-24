/** D023: solo servidor; jamás usar este secreto en componentes client. */
const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const DIGITS=/^[1-9][0-9]{7,16}$/u;
const MESSAGE='Hola, vi su presupuesto en Cotironda y quisiera consultarles por los materiales cotizados. ¡Gracias!';
export function enlaceWhatsappD023(raw:unknown):string|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const obj=raw as Record<string,unknown>;
 if(obj.state!=='authorized_contact_d023'||
  typeof obj.digits!=='string'||!DIGITS.test(obj.digits))return null;
 return 'https://api.whatsapp.com/send?phone='+obj.digits+'&text='+encodeURIComponent(MESSAGE);
}
export async function recuperarContactoVerificadoD023(
 rondaId:string,documentoId:string,sesionHmac:string,
 env:Record<string,string|undefined>=process.env
):Promise<string|null>{
 if(env.COTIRONDA_PILOT_SUPABASE_URL!==PILOT||
  typeof env.COTIRONDA_PILOT_SUPABASE_SECRET_KEY!=='string'||
  !env.COTIRONDA_PILOT_SUPABASE_SECRET_KEY.startsWith('sb_secret_'))
  return null;
 try{
  const res=await fetch(PILOT+'/functions/v1/cotironda-piloto-v2-supplier-contact-d023',{
   method:'POST',cache:'no-store',
   headers:{
    'authorization':'Bearer '+env.COTIRONDA_PILOT_SUPABASE_SECRET_KEY,
    'content-type':'application/json'
   },
   body:JSON.stringify({rondaId,documentoId,sesionHmac}),
   signal:AbortSignal.timeout(4_000)
  });
  if(!res.ok)return null;
  return enlaceWhatsappD023(await res.json());
 }catch{return null}
}
