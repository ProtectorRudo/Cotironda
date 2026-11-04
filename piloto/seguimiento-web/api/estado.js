// Public Vercel pilot proxy: the secret bearer remains only in POST body.
const BACKEND="https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-seguimiento";
// Reduce the trusted Edge payload to the fields the pilot buyer page needs.
// This is a second privacy boundary: future backend fields must never be
// forwarded to an unauthenticated browser by accident.
function buyerView(parsed){
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||
     !["waiting","closed","cancelled","not_found"].includes(parsed.state))return null;
  if(parsed.state==="not_found")return {state:"not_found"};
  if(parsed.state==="cancelled")return {state:"cancelled",can_open:false};
  const opened=parsed.can_open===true;
  const safe={state:parsed.state,can_open:opened};
  for(const key of ["received_count","files_pending_review"]){
    const n=Number(parsed[key]);
    if(Number.isSafeInteger(n)&&n>=0)safe[key]=n;
  }
  if(typeof parsed.deadline==="string"&&parsed.deadline.length<=96)
    safe.deadline=parsed.deadline;
  if(!opened)return safe;

  // Preserve all reviewed offer text faithfully, without allowing extra
  // identity, source-file or private envelope properties through.
  if(Array.isArray(parsed.offers)){
    if(!parsed.offers.every(o=>o&&typeof o==="object"&&!Array.isArray(o)&&
       typeof o.label==="string"&&o.label.length<=160&&
       typeof o.text==="string"&&o.text.length<=16000))return null;
    safe.offers=parsed.offers.map(o=>({label:o.label,text:o.text}));
  }
  const c=parsed.coverage;
  if(c&&typeof c==="object"&&!Array.isArray(c)){
    const keys=["state","quotations","requested_items","comparisons",
      "commercial_alternatives","packaging_unproven","not_evaluated",
      "explicit_differences","technical_uncertainty","ranking_allowed",
      "price_comparable","contacts_revealed"];
    safe.coverage=Object.fromEntries(keys.map(k=>[k,c[k]]));
  }
  if(parsed.state==="closed"&&Array.isArray(parsed.finalists)){
    if(parsed.finalists.length>2||!parsed.finalists.every(f=>f&&
      typeof f==="object"&&!Array.isArray(f)&&
      typeof f.name==="string"&&f.name.length<=160&&
      typeof f.whatsapp==="string"&&f.whatsapp.length<=32))return null;
    safe.finalists=parsed.finalists.map(f=>({name:f.name,whatsapp:f.whatsapp}));
    safe.joint_supplier_coverage=parsed.joint_supplier_coverage===true;
  }
  return safe;
}
export default async function handler(req,res){
  res.setHeader("Cache-Control","private, no-store, max-age=0");
  res.setHeader("Referrer-Policy","no-referrer");
  res.setHeader("X-Content-Type-Options","nosniff");
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).end();}
  if((req.headers?.["content-type"]??"").split(";")[0].trim().toLowerCase()!=="application/json")
    return res.status(415).end();
  const d=req.body;
  if(!d||typeof d!=="object"||Array.isArray(d)||
     Object.keys(d).length!==1||typeof d.token!=="string"||
     !/^[a-f0-9]{64}$/.test(d.token))return res.status(400).end();
  try{
    const upstream=await fetch(BACKEND,{method:"POST",redirect:"error",
      headers:{"content-type":"application/json","accept":"application/json"},
      body:JSON.stringify({token:d.token}),signal:AbortSignal.timeout(9000)});
    if(!upstream.ok)return res.status(502).json({state:"unavailable"});
    const body=await upstream.text();
    if(body.length>65536)return res.status(502).json({state:"unavailable"});
    const safe=buyerView(JSON.parse(body));
    if(!safe)return res.status(502).json({state:"unavailable"});
    return res.status(200).json(safe);
  }catch{return res.status(502).json({state:"unavailable"});}
}
