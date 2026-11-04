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
    const n=parsed[key];
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
  // Independent ECONOMIC counts, after edge+RPC checks. No prices, PII
  // or arbitrary fields may pass the public proxy. Invalid means OMIT.
  const e=parsed.economy;
  if(e&&typeof e==="object"&&!Array.isArray(e)&&
     e.state==="economia_observada_sin_ranking"&&
     e.ranking_allowed===false&&e.price_comparable===false&&
     e.contacts_revealed===false&&Array.isArray(safe.offers)&&
     Number.isSafeInteger(e.quotations)&&e.quotations===safe.offers.length&&
     e.quotations>=1&&e.quotations<=100){
    const counters=["iva_not_informed","freight_not_informed",
      "freight_to_agree","stock_unverified","payment_not_informed",
      "net_unverified","delivery_unverified","minimum_unverified"];
    if(counters.every(k=>Number.isSafeInteger(e[k])&&e[k]>=0&&
       e[k]<=e.quotations)&&
       e.freight_not_informed+e.freight_to_agree<=e.quotations)
      safe.economy=Object.fromEntries(["state","quotations",...counters,
       "ranking_allowed","price_comparable","contacts_revealed"]
       .map(k=>[k,e[k]]));
  }
  // MVP186: only the Edge's already reduced per-article price REFERENCES
  // can pass. The private envelope, HMACs, source hashes, file paths and
  // identity fields are never serialised by this proxy.
  const p=parsed.item_prices;
  if(safe.economy&&p&&typeof p==="object"&&!Array.isArray(p)&&
     p.state==="importes_por_articulo_sin_ranking"&&
     p.ranking_allowed===false&&p.price_comparable===false&&
     p.contacts_revealed===false&&p.adjudicacion===false&&
     p.originales_descargables===false&&p.IVA_calculado===false&&
     p.flete_calculado===false&&p.stock_confirmado===false&&
     Number.isSafeInteger(p.quotations)&&p.quotations===safe.offers.length&&
     p.quotations===safe.economy.quotations&&
     Number.isSafeInteger(p.requested_items)&&p.requested_items>=1&&
     p.requested_items<=25&&Array.isArray(p.articulos)&&
     p.articulos.length===p.requested_items){
    const labels=safe.offers.map(o=>o.label);
    const allowedStates=new Set(["alternativa_comercial_con_aclaracion",
      "coincide_volumen_nominal_sin_stock","no_homologable",
      "sin_importe_asignable"]);
    const allowedVat=new Set(["sin_iva_por_convencion","sin_iva_declarado",
      "iva_incluido_no_homologado","iva_ambiguo"]);
    const allowedUnits=new Set(["unit","bag","box","kg","g","l","ml",
      "m","m2","m3","roll","pack"]);
    const goodRows=p.articulos.every(row=>row&&typeof row==="object"&&
      /^item_\d{3}$/.test(row.itemId)&&
      typeof row.descripcionSolicitada==="string"&&
      row.descripcionSolicitada.trim().length>=1&&
      row.descripcionSolicitada.length<=500&&
      typeof row.cantidadSolicitada==="string"&&
      /^(?:0|[1-9]\d{0,8})\.\d{3}$/.test(row.cantidadSolicitada)&&
      allowedUnits.has(row.unidadSolicitada)&&
      Array.isArray(row.referencias)&&
      row.referencias.length===labels.length&&
      row.referencias.every(ref=>ref&&typeof ref==="object"&&
        labels.includes(ref.oferta)&&allowedStates.has(ref.estado)&&
        allowedVat.has(ref.iva)&&
        (ref.importeCotizado===null&&ref.cantidadCotizadaLiteral===null||
         typeof ref.importeCotizado==="string"&&
         typeof ref.cantidadCotizadaLiteral==="string"&&
         /^[0-9][0-9., ]{0,47}$/.test(ref.cantidadCotizadaLiteral))&&
        (ref.importeCotizado===null||
         typeof ref.importeCotizado==="string"&&
         ref.importeCotizado.length<=48&&
         /^(?:\s*(?:ARS|USD)?\s*\$?\s*)?[\d.,]+\s*$/i.test(ref.importeCotizado)))&&
      new Set(row.referencias.map(ref=>ref.oferta)).size===labels.length);
    if(goodRows&&new Set(p.articulos.map(row=>row.itemId)).size===p.articulos.length&&
       new Set(labels).size===labels.length){
      safe.item_prices={
       state:"importes_por_articulo_sin_ranking",
       quotations:p.quotations,requested_items:p.requested_items,
       articulos:p.articulos.map(row=>({
        itemId:row.itemId,
        descripcionSolicitada:row.descripcionSolicitada,
        cantidadSolicitada:row.cantidadSolicitada,
        unidadSolicitada:row.unidadSolicitada,
        referencias:row.referencias.map(ref=>({
         oferta:ref.oferta,importeCotizado:ref.importeCotizado,
         cantidadCotizadaLiteral:ref.cantidadCotizadaLiteral,
         estado:ref.estado,iva:ref.iva
        }))
       })),
       ranking_allowed:false,price_comparable:false,contacts_revealed:false,
       adjudicacion:false,originales_descargables:false,
       IVA_calculado:false,flete_calculado:false,stock_confirmado:false
      };
    }
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
