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
  // MVP299: verified offer opening and interpreted responses are
  // INDEPENDENT. Do not hide source-reviewed pending coverage merely
  // because no price is yet comparable. Strict per-field whitelist.
  const pending=parsed.pendientes_rubros_ia;
  const fields=["state","respuestas","ranking_permitido",
    "contactos_revelados","adjudicacion_automatica"];
  const same=(o,keys)=>o&&typeof o==="object"&&!Array.isArray(o)&&
    Object.keys(o).length===keys.length&&
    keys.every(k=>Object.hasOwn(o,k));
  const allowed=new Set(["obra_gruesa","pintura","electricidad",
    "construccion_seca","sanitarios","ferreteria","otros"]);
  const titles={
    obra_gruesa:"Obra gruesa / Corralón",pintura:"Pintura",
    electricidad:"Electricidad",construccion_seca:"Construcción en seco",
    sanitarios:"Sanitarios",ferreteria:"Ferretería y fijaciones",
    otros:"Otros materiales"
  };
  const metadata=parsed.rubros_ia;
  if(same(pending,fields)&&
     pending.state==="respuestas_interpretadas_sin_precio_comparable"&&
     pending.ranking_permitido===false&&
     pending.contactos_revelados===false&&
     pending.adjudicacion_automatica===false&&
     Array.isArray(pending.respuestas)&&pending.respuestas.length<=25&&
     Array.isArray(metadata)&&metadata.length>=1&&metadata.length<=7){
    const known=new Map(),rows=[];
    let valid=metadata.every(r=>r&&typeof r==="object"&&
      allowed.has(r.rubro)&&r.titulo===titles[r.rubro]&&
      Number.isSafeInteger(r.solicitados)&&r.solicitados>=1&&
      r.solicitados<=200&&!known.has(r.rubro)&&
      (known.set(r.rubro,r.solicitados),true));
    if(valid)for(const [i,r] of pending.respuestas.entries()){
      if(!same(r,["label","rubros"])||
         r.label!=="Respuesta en revisión "+(i+1)||
         !Array.isArray(r.rubros)||r.rubros.length<1||
         r.rubros.length>known.size){valid=false;break;}
      const used=new Set(),bucket=[];
      for(const v of r.rubros){
        if(!same(v,["rubro","titulo","respondidos","solicitados"])||
           !allowed.has(v.rubro)||used.has(v.rubro)||
           v.titulo!==titles[v.rubro]||
           !Number.isSafeInteger(v.solicitados)||v.solicitados<1||
           v.solicitados>25||v.solicitados>known.get(v.rubro)||
           !Number.isSafeInteger(v.respondidos)||v.respondidos<1||
           v.respondidos>v.solicitados){valid=false;break;}
        used.add(v.rubro);
        bucket.push({rubro:v.rubro,titulo:v.titulo,
          solicitados:v.solicitados,respondidos:v.respondidos});
      }
      if(!valid)break;
      rows.push({label:r.label,rubros:bucket});
    }
    if(valid)safe.pendientes_rubros_ia={
      state:"respuestas_interpretadas_sin_precio_comparable",
      respuestas:rows,ranking_permitido:false,
      contactos_revelados:false,adjudicacion_automatica:false
    };
  }
  // MVP303: only AFTER closure, the buyer may see the identity of EVERY
  // invited, currently consented supplier. No max-two finalist shortcut;
  // no contacts, phone, HMAC, source, pricing or automatic award.
  const roster=parsed.todos_proveedores_cierre;
  if(roster!==undefined){
    const exact=(x,keys)=>x&&typeof x==="object"&&!Array.isArray(x)&&
      Object.keys(x).length===keys.length&&
      keys.every(k=>Object.prototype.hasOwnProperty.call(x,k));
    const keys=["state","proveedores","cantidad","invitados",
      "solo_post_cierre","identidades_reveladas","telefonos_revelados",
      "ranking_global_permitido","adjudicacion_automatica","mensajes_enviados"];
    const rowKeys=["nombre","oferta","estado"];
    const allowed=new Set(["presupuesto_verificado","respuesta_en_revision",
      "sin_respuesta","envio_no_confirmado"]);
    const aliases=new Set();
    if(parsed.state!=="closed"||!exact(roster,keys)||
       roster.state!=="proveedores_revelados_al_cierre"||
       !Number.isSafeInteger(roster.cantidad)||
       !Number.isSafeInteger(roster.invitados)||
       roster.cantidad<0||roster.invitados<0||
       roster.cantidad>100||roster.invitados>100||
       !Array.isArray(roster.proveedores)||
       roster.proveedores.length!==roster.cantidad||
       roster.cantidad>roster.invitados||
       roster.solo_post_cierre!==true||
       roster.identidades_reveladas!==true||
       roster.telefonos_revelados!==false||
       roster.ranking_global_permitido!==false||
       roster.adjudicacion_automatica!==false||
       roster.mensajes_enviados!==false)return null;
    const rows=[];
    for(const x of roster.proveedores){
      if(!exact(x,rowKeys)||typeof x.nombre!=="string"||
         x.nombre.length<2||x.nombre.length>100||
         x.nombre.trim()!==x.nombre||
         /[<>\x00-\x1f\x7f]/u.test(x.nombre)||
         /[0-9]{8,}/u.test(x.nombre)||
         !allowed.has(x.estado)||
         !(x.oferta===null||
           (typeof x.oferta==="string"&&
            /^Presupuesto (?:[1-9]|[1-9][0-9]|100)$/u.test(x.oferta)))||
         (x.estado==="presupuesto_verificado")!==(x.oferta!==null)||
         (x.oferta!==null&&aliases.has(x.oferta)))return null;
      if(x.oferta!==null)aliases.add(x.oferta);
      rows.push({nombre:x.nombre,oferta:x.oferta,estado:x.estado});
    }
    safe.todos_proveedores_cierre={
      state:"proveedores_revelados_al_cierre",
      proveedores:rows,cantidad:rows.length,invitados:roster.invitados,
      solo_post_cierre:true,identidades_reveladas:true,
      telefonos_revelados:false,ranking_global_permitido:false,
      adjudicacion_automatica:false,mensajes_enviados:false
    };
  }
  // MVP304 - a separate, per-supplier consented phone list, ONLY after
  // the MVP303 buyer-bound roster has passed its independent whitelist.
  // A verified company with no explicit contact opt-in remains name-only.
  const consented=parsed.contactos_proveedores_cierre;
  if(consented!==undefined){
    const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
    const exact=(o,keys)=>o&&typeof o==="object"&&!Array.isArray(o)&&
      Object.keys(o).length===keys.length&&keys.every(k=>has(o,k));
    const names=safe.todos_proveedores_cierre?.proveedores;
    if(parsed.state!=="closed"||!Array.isArray(names)||
       !exact(consented,["state","contactos"])||
       consented.state!=="contactos_consentidos_al_cierre"||
       !Array.isArray(consented.contactos)||
       consented.contactos.length<1||
       consented.contactos.length>names.length||
       new Set(names.map(n=>n.nombre)).size!==names.length)return null;
    const validNames=new Set(names.map(n=>n.nombre)),seen=new Set(),rows=[];
    for(const person of consented.contactos){
      if(!exact(person,["nombre","whatsapp"])||
        typeof person.nombre!=="string"||
        !validNames.has(person.nombre)||seen.has(person.nombre)||
        typeof person.whatsapp!=="string"||
        !/^[1-9][0-9]{7,16}$/u.test(person.whatsapp))return null;
      seen.add(person.nombre);
      rows.push({nombre:person.nombre,whatsapp:person.whatsapp});
    }
    safe.contactos_proveedores_cierre={
      state:"contactos_consentidos_al_cierre",contactos:rows
    };
  }
  // MVP326: buyer-safe stage of the LATEST source; an economic review
  // completed with failure is NOT an in-flight job. No source or diagnosis.
  const status=parsed.estado_revision_ia;
  if(["waiting","closed"].includes(parsed.state)&&
     same(status,["state","vinculados","requieren_revision",
      "en_proceso","verificados","precios_incluidos",
      "identidades_reveladas","reproceso_automatico"])&&
     status.state==="estado_comercial_sin_precios"&&
     status.precios_incluidos===false&&
     status.identidades_reveladas===false&&
     status.reproceso_automatico===false&&
     ["vinculados","requieren_revision","en_proceso","verificados"]
      .every(k=>Number.isSafeInteger(status[k])&&status[k]>=0&&status[k]<=25)&&
     status.requieren_revision+status.en_proceso+status.verificados===
       status.vinculados&&
     Number.isSafeInteger(safe.received_count)&&
     status.vinculados<=safe.received_count){
    safe.estado_revision_ia={
      state:"estado_comercial_sin_precios",
      vinculados:status.vinculados,
      requieren_revision:status.requieren_revision,
      en_proceso:status.en_proceso,
      verificados:status.verificados,
      precios_incluidos:false,
      identidades_reveladas:false,
      reproceso_automatico:false
    };
  }
  if(!opened)return safe;

  // Preserve all reviewed offer text faithfully, without allowing extra
  // identity, source-file or private envelope properties through.
  if(Array.isArray(parsed.offers)){
    if(!parsed.offers.every(o=>o&&typeof o==="object"&&!Array.isArray(o)&&
       typeof o.label==="string"&&o.label.length<=160&&
       typeof o.text==="string"&&o.text.length<=16000))return null;
    safe.offers=parsed.offers.map(o=>({label:o.label,text:o.text}));
  }
  // MVP322 — second independent boundary for per-offer provisional sums.
  // Copy only buyer-origin descriptions and verified matching source prices;
  // never trust a provided subtotal without recomputing it using BigInt.
  const pre=parsed.preliminar_cotizaciones_ia;
  if(opened&&["waiting","closed"].includes(parsed.state)&&
     Array.isArray(safe.offers)&&same(pre,[
      "state","ofertas","ranking_permitido","total_final","iva_calculado",
      "flete_calculado","contactos_revelados","adjudicacion_automatica"
     ])&&pre.state==="preliminar_anonimo_verificado"&&
     ["ranking_permitido","total_final","iva_calculado",
      "flete_calculado","contactos_revelados","adjudicacion_automatica"]
       .every(k=>pre[k]===false)&&
     Array.isArray(pre.ofertas)&&pre.ofertas.length>=1&&pre.ofertas.length<=25){
    const offerFields=["label","moneda","iva","flete","pago","articulos",
      "articulosConImporte","solicitadosAsignados","respondidosAsignados",
      "precioDeMaterialesCentavos","cobertura"];
    const itemFields=["itemId","descripcion","rubro","cantidadSolicitada",
      "unidadSolicitada","importeRenglonCentavos"];
    const validLabel=/^Presupuesto [1-9][0-9]{0,2}$/u;
    const validCentavos=/^(?:0|[1-9][0-9]{0,16})$/u;
    const validQty=/^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,3})?$/u;
    const allowedUnits=new Set(["unit","bag","box","kg","g","l","ml",
      "m","m2","m3","roll","pack"]);
    const currencies=new Set(["ARS","USD"]);
    const vat=new Set(["incluido_explicito","sin_iva_explicito","no_informado"]);
    const freight=new Set(["incluido_explicito","excluido_explicito",
      "a_convenir","no_informado"]);
    const pay=new Set(["contado","transferencia","credito","no_informado"]);
    let valid=true;
    const known=new Set(),out=[];
    for(const q of pre.ofertas){
      if(!same(q,offerFields)||!validLabel.test(q.label)||
         known.has(q.label)||!currencies.has(q.moneda)||
         !vat.has(q.iva)||!freight.has(q.flete)||!pay.has(q.pago)||
         !Number.isSafeInteger(q.articulosConImporte)||
         !Number.isSafeInteger(q.respondidosAsignados)||
         !Number.isSafeInteger(q.solicitadosAsignados)||
         q.solicitadosAsignados<1||q.solicitadosAsignados>200||
         q.respondidosAsignados<q.articulosConImporte||
         q.respondidosAsignados>q.solicitadosAsignados||
         !Array.isArray(q.articulos)||q.articulos.length<1||
         q.articulos.length>25||
         q.articulosConImporte!==q.articulos.length||
         typeof q.precioDeMaterialesCentavos!=="string"||
         !/^(?:0|[1-9][0-9]{0,19})$/u.test(q.precioDeMaterialesCentavos)||
         !["parcial","completa_asignada"].includes(q.cobertura)||
         (q.cobertura==="completa_asignada")!==(
           q.solicitadosAsignados===q.respondidosAsignados&&
           q.articulos.length===q.solicitadosAsignados)){
        valid=false;break;
      }
      known.add(q.label);
      const ids=new Set(),lines=[];
      let subtotal=0n;
      for(const line of q.articulos){
        if(!same(line,itemFields)||
           typeof line.itemId!=="string"||
           !/^item_[1-9][0-9]{0,2}$/u.test(line.itemId)||
           ids.has(line.itemId)||
           typeof line.descripcion!=="string"||
           line.descripcion.trim().length<1||line.descripcion.length>500||
           /[\x00-\x1f\x7f]/u.test(line.descripcion)||
           !allowed.has(line.rubro)||
           !safe.offers.some(o=>
             o.label===q.label+" · "+titles[line.rubro])||
           typeof line.cantidadSolicitada!=="string"||
           !validQty.test(line.cantidadSolicitada)||
           !allowedUnits.has(line.unidadSolicitada)||
           typeof line.importeRenglonCentavos!=="string"||
           !validCentavos.test(line.importeRenglonCentavos)){
          valid=false;break;
        }
        ids.add(line.itemId);
        subtotal+=BigInt(line.importeRenglonCentavos);
        lines.push({
         itemId:line.itemId,descripcion:line.descripcion,rubro:line.rubro,
         cantidadSolicitada:line.cantidadSolicitada,
         unidadSolicitada:line.unidadSolicitada,
         importeRenglonCentavos:line.importeRenglonCentavos
        });
      }
      if(!valid||subtotal.toString()!==q.precioDeMaterialesCentavos){
        valid=false;break;
      }
      out.push({
        label:q.label,moneda:q.moneda,iva:q.iva,flete:q.flete,pago:q.pago,
        articulos:lines,articulosConImporte:lines.length,
        solicitadosAsignados:q.solicitadosAsignados,
        respondidosAsignados:q.respondidosAsignados,
        precioDeMaterialesCentavos:subtotal.toString(),cobertura:q.cobertura
      });
    }
    if(valid)safe.preliminar_cotizaciones_ia={
      state:"preliminar_anonimo_verificado",ofertas:out,
      ranking_permitido:false,total_final:false,iva_calculado:false,
      flete_calculado:false,contactos_revelados:false,
      adjudicacion_automatica:false
    };
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
     p.requested_items<=30&&Array.isArray(p.articulos)&&
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
         /^\s*(?:(?:AR\$|US\$|U\$S|(?:ARS|USD)\s*\$?|\$)\s*)?[\d.,]+\s*$/i.test(ref.importeCotizado)))&&
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
  // MVP216: only a complete per-item, source-gated, anonymous rubric map.
  // Never accept arbitrary metadata, texts, supplier names or money here.
  const rubros=parsed.rubros;
  if(safe.item_prices&&rubros&&typeof rubros==="object"&&
     !Array.isArray(rubros)&&rubros.state==="rubros_por_articulo"&&
     rubros.ranking_allowed===false&&
     rubros.contacts_revealed===false&&rubros.automatic_award===false&&
     Array.isArray(rubros.items)&&
     rubros.items.length===safe.item_prices.articulos.length){
    const ids=safe.item_prices.articulos.map(item=>item.itemId);
    const allowed=new Set(["obra_gruesa","pintura","electricidad",
      "construccion_seca","sanitarios","ferreteria","otros"]);
    if(rubros.items.every((x,i)=>x&&typeof x==="object"&&
       !Array.isArray(x)&&Object.keys(x).length===2&&
       x.itemId===ids[i]&&allowed.has(x.rubro))){
      safe.rubros={
       state:"rubros_por_articulo",
       items:rubros.items.map(x=>({itemId:x.itemId,rubro:x.rubro})),
       ranking_allowed:false,contacts_revealed:false,automatic_award:false
      };
    }
  }
  // MVP255 — same token-authenticated Edge projection of SQL-verified
  // rubros. Strict whitelist: no raw quotes, original, supplier or HMAC.
  const cmp=parsed.comparador_rubros_ia;
  if(opened&&cmp&&typeof cmp==="object"&&!Array.isArray(cmp)&&
     cmp.state==="alternativas_rubro_con_importes_sin_ranking"&&
     cmp.ranking_global_permitido===false&&
     cmp.adjudicacion_automatica===false&&
     cmp.contactos_revelados===false&&
     Array.isArray(cmp.presupuestosAnonimos)&&
     cmp.presupuestosAnonimos.length<=25&&
     cmp.presupuestosAnonimos.every(x=>
       /^Presupuesto [1-9][0-9]{0,2}$/u.test(x))&&
     new Set(cmp.presupuestosAnonimos).size===cmp.presupuestosAnonimos.length&&
     Array.isArray(cmp.rubros)&&cmp.rubros.length>=1&&cmp.rubros.length<=7&&
     Array.isArray(parsed.rubros_ia)&&parsed.rubros_ia.length===cmp.rubros.length){
    const allowed=new Set(["obra_gruesa","pintura","electricidad",
      "construccion_seca","sanitarios","ferreteria","otros"]);
    const names={
      obra_gruesa:"Obra gruesa / Corralón",pintura:"Pintura",
      electricidad:"Electricidad",construccion_seca:"Construcción en seco",
      sanitarios:"Sanitarios",ferreteria:"Ferretería y fijaciones",
      otros:"Otros materiales"
    };
    const id=/^item_[1-9][0-9]{0,2}$/u;
    const label=/^Presupuesto [1-9][0-9]{0,2}$/u;
    const unique=arr=>new Set(arr).size===arr.length;
    const int=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
    const seen=new Set();
    let valid=true;
    const normalized=[];
    for(const r of cmp.rubros){
      if(!r||typeof r!=="object"||Array.isArray(r)||
         !allowed.has(r.rubro)||seen.has(r.rubro)||
         r.titulo!==names[r.rubro]||
         !int(r.solicitados,200)||r.solicitados<1||
         !Array.isArray(r.articulosSolicitados)||
         r.articulosSolicitados.length!==r.solicitados||
         !r.articulosSolicitados.every(x=>id.test(x))||
         !unique(r.articulosSolicitados)||
         !int(r.opcionesTotales,325)||
         !Array.isArray(r.opciones)||r.opciones.length>12||
         r.opciones.length>r.opcionesTotales||
         !Array.isArray(r.ofertasConRespuestaSinPrecio)||
         r.ofertasConRespuestaSinPrecio.length>25||
         !r.ofertasConRespuestaSinPrecio.every(x=>label.test(x)&&
           cmp.presupuestosAnonimos.includes(x))||
         !unique(r.ofertasConRespuestaSinPrecio)||
         !Array.isArray(r.articulosConReferenciasCoincidentes)||
         r.articulosConReferenciasCoincidentes.length>r.solicitados||
         !r.articulosConReferenciasCoincidentes.every(x=>id.test(x)&&
           r.articulosSolicitados.includes(x))||
         !unique(r.articulosConReferenciasCoincidentes)||
         !parsed.rubros_ia.some(x=>x&&x.rubro===r.rubro&&
           x.titulo===r.titulo&&x.solicitados===r.solicitados)){
        valid=false;break;
      }
      seen.add(r.rubro);
      const options=[];
      for(const option of r.opciones){
        if(!option||typeof option!=="object"||Array.isArray(option)||
           !Array.isArray(option.ofertasAnonimas)||
           option.ofertasAnonimas.length<1||option.ofertasAnonimas.length>2||
           !option.ofertasAnonimas.every(x=>label.test(x)&&
             cmp.presupuestosAnonimos.includes(x))||
           !unique(option.ofertasAnonimas)||
           !Array.isArray(option.articulosConPrecio)||
           option.articulosConPrecio.length<1||
           option.articulosConPrecio.length>r.solicitados||
           !option.articulosConPrecio.every(x=>id.test(x)&&
             r.articulosSolicitados.includes(x))||
           !unique(option.articulosConPrecio)||
           !Array.isArray(option.articulosPendientes)||
           option.articulosPendientes.length>r.solicitados||
           !option.articulosPendientes.every(x=>id.test(x)&&
             r.articulosSolicitados.includes(x))||
           !unique(option.articulosPendientes)||
           !unique([...option.articulosConPrecio,...option.articulosPendientes])||
           option.articulosConPrecio.length+option.articulosPendientes.length!==
            r.solicitados||
           !["parcial_con_importes","completa_con_importes"].includes(option.cobertura)||
           (option.cobertura==="completa_con_importes")!==
            (option.articulosPendientes.length===0)||
           typeof option.condicionesDeclaradasIguales!=="boolean"||
           option.totalGlobalComparable!==false){
          valid=false;break;
        }
        options.push({
          ofertasAnonimas:option.ofertasAnonimas.slice(),
          articulosConPrecio:option.articulosConPrecio.slice(),
          articulosPendientes:option.articulosPendientes.slice(),
          cobertura:option.cobertura,
          condicionesDeclaradasIguales:option.condicionesDeclaradasIguales,
          totalGlobalComparable:false
        });
      }
      if(!valid)break;
      normalized.push({
        rubro:r.rubro,titulo:r.titulo,solicitados:r.solicitados,
        articulosSolicitados:r.articulosSolicitados.slice(),
        opciones:options,opcionesTotales:r.opcionesTotales,
        ofertasConRespuestaSinPrecio:r.ofertasConRespuestaSinPrecio.slice(),
        articulosConReferenciasCoincidentes:
          r.articulosConReferenciasCoincidentes.slice()
      });
    }
    if(valid&&seen.size===parsed.rubros_ia.length)
      safe.comparador_rubros_ia={
        state:"alternativas_rubro_con_importes_sin_ranking",
        presupuestosAnonimos:cmp.presupuestosAnonimos.slice(),
        rubros:normalized,
        ranking_global_permitido:false,
        adjudicacion_automatica:false,
        contactos_revelados:false
      };
  }

  // MVP189 — potential full commercial coverage ONLY AFTER closure.
  // No seller identity, contacts, economic totals, tax, award, or access to
  // originals. Re-validate labels/counts and whitelist the entire payload.
  const optionSet=parsed.coverage_options;
  if(parsed.state==="closed"&&safe.can_open===true&&
     safe.coverage?.state==="cobertura_revisada"&&
     safe.coverage.ranking_allowed===false&&
     safe.coverage.price_comparable===false&&
     safe.coverage.contacts_revealed===false&&safe.economy&&
     optionSet&&typeof optionSet==="object"&&!Array.isArray(optionSet)&&
     optionSet.state==="alternativas_cobertura_sin_ranking"&&
     ["ranking_allowed","price_comparable","tax_calculated",
      "freight_calculated","stock_confirmed","contacts_revealed",
      "automatic_award","finalists_selected","whatsapp_sent",
      "originals_downloadable"].every(k=>optionSet[k]===false)&&
     Number.isSafeInteger(optionSet.quotations)&&
     optionSet.quotations===safe.offers?.length&&
     optionSet.quotations===safe.coverage.quotations&&
     optionSet.quotations===safe.economy.quotations&&
     optionSet.quotations>=1&&optionSet.quotations<=12&&
     Number.isSafeInteger(optionSet.requested_items)&&
     optionSet.requested_items===safe.coverage.requested_items&&
     optionSet.requested_items>=1&&optionSet.requested_items<=30&&
     Array.isArray(optionSet.coberturaPorOferta)&&
     optionSet.coberturaPorOferta.length===optionSet.quotations&&
     Array.isArray(optionSet.alternativas)&&
     optionSet.alternativas.length<=78){
    const labels=safe.offers.map(o=>o.label);
    const rows=optionSet.coberturaPorOferta;
    const counts=new Map();
    const correctCounts=rows.every(r=>r&&typeof r==="object"&&
      labels.includes(r.oferta)&&!counts.has(r.oferta)&&
      Number.isSafeInteger(r.articulosConAlternativa)&&
      r.articulosConAlternativa>=0&&
      r.articulosConAlternativa<=optionSet.requested_items&&
      r.articulosSolicitados===optionSet.requested_items&&
      (counts.set(r.oferta,r.articulosConAlternativa),true));
    const sum=rows.reduce((v,r)=>v+(r?.articulosConAlternativa||0),0);
    const seen=new Set();
    const correctOptions=optionSet.alternativas.every(opt=>{
      if(!opt||typeof opt!=="object"||
        !["individual","complementaria"].includes(opt.modo)||
        !Array.isArray(opt.ofertasAnonimas)||
        opt.ofertasAnonimas.length!==(opt.modo==="individual"?1:2)||
        new Set(opt.ofertasAnonimas).size!==opt.ofertasAnonimas.length||
        opt.ofertasAnonimas.some(x=>!labels.includes(x))||
        !Array.isArray(opt.articulos)||
        opt.articulos.length!==optionSet.requested_items)return false;
      const providers=opt.ofertasAnonimas;
      const key=providers.slice().sort().join("|");
      if(seen.has(key))return false;
      seen.add(key);
      if(opt.modo==="individual"&&
         counts.get(providers[0])!==optionSet.requested_items)return false;
      if(opt.modo==="complementaria"&&(
        counts.get(providers[0])>=optionSet.requested_items||
        counts.get(providers[1])>=optionSet.requested_items))return false;
      const articleSet=new Set(),used=new Set();
      for(const art of opt.articulos){
        if(!art||typeof art!=="object"||
          !/^item_\d{3}$/.test(art.itemId)||
          articleSet.has(art.itemId)||
          !Array.isArray(art.ofertasConAlternativa)||
          art.ofertasConAlternativa.length<1||
          art.ofertasConAlternativa.length>providers.length||
          new Set(art.ofertasConAlternativa).size!==
            art.ofertasConAlternativa.length||
          art.ofertasConAlternativa.some(x=>!providers.includes(x)))
          return false;
        articleSet.add(art.itemId);
        art.ofertasConAlternativa.forEach(x=>used.add(x));
      }
      if(articleSet.size!==optionSet.requested_items||
         used.size!==providers.length)return false;
      if(opt.modo==="complementaria"&&providers.some(provider=>
        !opt.articulos.some(item=>
          item.ofertasConAlternativa.length===1&&
          item.ofertasConAlternativa[0]===provider)))return false;
      return true;
    });
    if(correctCounts&&counts.size===labels.length&&
       sum===safe.coverage.commercial_alternatives&&correctOptions){
      safe.coverage_options={
       state:"alternativas_cobertura_sin_ranking",
       quotations:optionSet.quotations,requested_items:optionSet.requested_items,
       coberturaPorOferta:rows.map(r=>({
        oferta:r.oferta,articulosConAlternativa:r.articulosConAlternativa,
        articulosSolicitados:r.articulosSolicitados
       })),
       alternativas:optionSet.alternativas.map(o=>({
        modo:o.modo,ofertasAnonimas:o.ofertasAnonimas.slice(),
        articulos:o.articulos.map(a=>({
          itemId:a.itemId,
          ofertasConAlternativa:a.ofertasConAlternativa.slice()
        }))
       })),
       ranking_allowed:false,price_comparable:false,tax_calculated:false,
       freight_calculated:false,stock_confirmed:false,contacts_revealed:false,
       automatic_award:false,finalists_selected:false,whatsapp_sent:false,
       originals_downloadable:false
      };
    }
  }

  // MVP203: guidance is derived EXCLUSIVELY from the MVP189 source-bound,
  // buyer-token-gated and fully whitelisted coverage options above.
  // Never pick two by arrival order or an incomplete economic ranking.
  // Every offer remains in safe.offers, including partial candidates.
  if(parsed.state==="closed"&&safe.can_open===true&&safe.coverage_options){
    const complete=safe.coverage_options.alternativas;
    const individual=complete.filter(x=>x.modo==="individual");
    const combinations=complete.filter(x=>x.modo==="complementaria");
    let tipo="multiples_sin_preferencia",ofertasAnonimas=[];
    if(complete.length===0)tipo="sin_cobertura_completa";
    else if(combinations.length===0&&individual.length===1){
      tipo="una_individual";ofertasAnonimas=individual[0].ofertasAnonimas.slice();
    }else if(combinations.length===0&&individual.length===2){
      tipo="dos_individuales";
      ofertasAnonimas=individual.map(x=>x.ofertasAnonimas[0]);
    }else if(individual.length===0&&combinations.length===1){
      tipo="pareja_complementaria";
      ofertasAnonimas=combinations[0].ofertasAnonimas.slice();
    }
    safe.orientacion={
      state:"orientacion_de_cobertura_no_economica",
      tipo,ofertasAnonimas,
      alternativasCompletas:complete.length,
      presupuestosRevisados:safe.offers.length,
      ranking_allowed:false,price_comparable:false,
      contacts_revealed:false,automatic_award:false,
      originales_descargables:false
    };
  }

  // MVP194 — a second boundary independently recalculates source-priced
  // article COVERAGE from the already-whitelisted MVP186 document values.
  // Never let an Edge future field supply its own money, supplier IDs or
  // ranking. Only AFTER closure; invalid projections are omitted.
  const pc=parsed.priced_coverage;
  if(parsed.state==="closed"&&safe.can_open===true&&safe.item_prices&&
     safe.economy&&pc&&typeof pc==="object"&&!Array.isArray(pc)&&
     pc.state==="cobertura_importes_sin_ranking"&&
     ["ranking_allowed","price_comparable","tax_calculated",
      "freight_calculated","stock_confirmed","contacts_revealed",
      "automatic_award","finalists_selected","whatsapp_sent",
      "originals_downloadable"].every(k=>pc[k]===false)&&
     pc.quotations===safe.offers?.length&&
     pc.quotations===safe.item_prices.quotations&&
     pc.requested_items===safe.item_prices.requested_items&&
     Array.isArray(pc.coberturaPorOferta)&&
     pc.coberturaPorOferta.length===pc.quotations&&
     Array.isArray(pc.parejasConImportesParaTodos)&&
     pc.parejasConImportesParaTodos.length<=66){
    const labels=safe.offers.map(x=>x.label);
    const items=safe.item_prices.articulos;
    const priceMap=new Map(labels.map(label=>[label,new Set()]));
    for(const item of items){
      for(const ref of item.referencias){
        if(ref.importeCotizado!==null)priceMap.get(ref.oferta)?.add(item.itemId);
      }
    }
    const allRows=pc.coberturaPorOferta;
    const complete=allRows.every((r,i)=>r&&typeof r==="object"&&
      r.oferta===labels[i]&&r.articulosSolicitados===items.length&&
      r.articulosConImporte===priceMap.get(r.oferta)?.size);
    const eligible=[];
    for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
      const aa=labels[i],bb=labels[j],left=priceMap.get(aa),right=priceMap.get(bb);
      if(left.size===items.length||right.size===items.length||
        items.some(x=>!left.has(x.itemId)&&!right.has(x.itemId))||
        !items.some(x=>left.has(x.itemId)&&!right.has(x.itemId))||
        !items.some(x=>right.has(x.itemId)&&!left.has(x.itemId)))continue;
      eligible.push([aa,bb]);
    }
    const proposed=pc.parejasConImportesParaTodos;
    const correct=proposed.length===eligible.length&&
      proposed.every((pair,index)=>{
       const ids=eligible[index];
       return pair&&typeof pair==="object"&&
        Array.isArray(pair.ofertasAnonimas)&&
        pair.ofertasAnonimas.length===2&&
        pair.ofertasAnonimas[0]===ids[0]&&
        pair.ofertasAnonimas[1]===ids[1]&&
        Array.isArray(pair.articulos)&&
        pair.articulos.length===items.length&&
        pair.articulos.every((line,n)=>{
         if(!line||line.itemId!==items[n].itemId||
            !Array.isArray(line.ofertasConImporte))return false;
         const expected=ids.filter(id=>priceMap.get(id).has(line.itemId));
         return line.ofertasConImporte.length===expected.length&&
           line.ofertasConImporte.every((id,k)=>id===expected[k]);
        });
      });
    if(complete&&correct){
      safe.priced_coverage={
       state:"cobertura_importes_sin_ranking",quotations:labels.length,
       requested_items:items.length,
       coberturaPorOferta:allRows.map(x=>({
        oferta:x.oferta,articulosConImporte:x.articulosConImporte,
        articulosSolicitados:x.articulosSolicitados
       })),
       parejasConImportesParaTodos:proposed.map(pair=>({
        ofertasAnonimas:pair.ofertasAnonimas.slice(),
        articulos:pair.articulos.map(x=>({
         itemId:x.itemId,ofertasConImporte:x.ofertasConImporte.slice()
        }))
       })),
       ranking_allowed:false,price_comparable:false,tax_calculated:false,
       freight_calculated:false,stock_confirmed:false,
       contacts_revealed:false,automatic_award:false,
       finalists_selected:false,whatsapp_sent:false,
       originals_downloadable:false
      };
    }
  }

  // MVP204: per-offer readiness has NO money/rank/contact; accept ONLY
  // the buyer's already-whitelisted MVP186 price references. Recompute
  // every count and cross-check the independent MVP180 economic counters.
  const er=parsed.economic_readiness;
  if(parsed.state==="closed"&&safe.can_open===true&&safe.economy&&
     safe.item_prices&&er&&typeof er==="object"&&!Array.isArray(er)&&
     er.state==="condiciones_por_oferta_sin_ranking"&&
     ["ranking_allowed","price_comparable","contacts_revealed",
      "tax_calculated","freight_calculated","stock_confirmed",
      "automatic_award","originals_downloadable"].every(k=>er[k]===false)&&
     er.quotations===safe.offers?.length&&er.quotations===safe.economy.quotations&&
     er.requested_items===safe.item_prices.requested_items&&
     Array.isArray(er.ofertas)&&er.ofertas.length===er.quotations){
    const allowedIva=new Set(["no_informado","incluido","no_incluido",
     "tasa_sin_base","contradictorio"]);
    const allowedFreight=new Set(["no_informado","incluido","sin_cargo",
     "adicional_con_importe","adicional_sin_importe",
     "importe_sin_tratamiento","a_convenir","contradictorio"]);
    const allowedPayment=new Set(["no_informado","contado","transferencia",
     "cuenta_corriente_30_dias","multiple"]);
    const labels=safe.offers.map(o=>o.label);
    const counts=new Map(labels.map(label=>[label,0]));
    for(const item of safe.item_prices.articulos){
     for(const ref of item.referencias){
      if(ref.importeCotizado!==null)
       counts.set(ref.oferta,(counts.get(ref.oferta)??0)+1);
     }
    }
    const rows=er.ofertas;
    const currencyMatches=(label,currency)=>{
      if(currency==="no_acreditada")return true;
      if(currency!=="ARS"&&currency!=="USD")return false;
      const refs=safe.item_prices.articulos.flatMap(item=>
        item.referencias.filter(ref=>ref.oferta===label&&
          ref.importeCotizado!==null).map(ref=>ref.importeCotizado));
      return refs.length>0&&refs.every(v=>currency==="ARS"
        ?/^\s*AR\$\s*/i.test(v)
        :/^\s*(?:US\$|U\$S|USD\s*\$?)\s*/i.test(v));
    };
    const correct=rows.every((r,i)=>r&&typeof r==="object"&&!Array.isArray(r)&&
     r.oferta===labels[i]&&r.articulosSolicitados===er.requested_items&&
     Number.isSafeInteger(r.articulosConImporte)&&
     r.articulosConImporte===counts.get(r.oferta)&&
     allowedIva.has(r.iva)&&allowedFreight.has(r.flete)&&
     allowedPayment.has(r.pago)&&
       currencyMatches(r.oferta,r.moneda)&&
     r.stockCorroborado===false&&r.plazoCorroborado===false&&
     r.minimoCorroborado===false);
    const count=(key,value)=>rows.filter(r=>r[key]===value).length;
    if(correct&&count("iva","no_informado")===safe.economy.iva_not_informed&&
       count("flete","no_informado")===safe.economy.freight_not_informed&&
       count("flete","a_convenir")===safe.economy.freight_to_agree&&
       count("pago","no_informado")===safe.economy.payment_not_informed&&
       rows.length===safe.economy.stock_unverified&&
       rows.length===safe.economy.net_unverified&&
       rows.length===safe.economy.delivery_unverified&&
       rows.length===safe.economy.minimum_unverified){
      safe.economic_readiness={
       state:"condiciones_por_oferta_sin_ranking",
       quotations:rows.length,requested_items:er.requested_items,
       ofertas:rows.map(r=>({
        oferta:r.oferta,articulosConImporte:r.articulosConImporte,
        articulosSolicitados:r.articulosSolicitados,
        iva:r.iva,flete:r.flete,pago:r.pago,
        moneda:r.moneda,
        stockCorroborado:false,plazoCorroborado:false,
        minimoCorroborado:false
       })),
       ranking_allowed:false,price_comparable:false,
       contacts_revealed:false,tax_calculated:false,
       freight_calculated:false,stock_confirmed:false,
       automatic_award:false,originals_downloadable:false
      };
    }
  }

  // MVP210: provisional baskets of SOURCE-VERIFIED material prices, not
  // a final comparable quote or a winner. This proxy independently sums
  // every requested line from already-whitelisted per-article source amounts
  // and checks currency, seller labels, tax convention and completeness.
  const mb=parsed.material_baskets;
  if(parsed.state==="closed"&&safe.can_open===true&&safe.item_prices&&
     safe.economy&&safe.economic_readiness&&
     mb&&typeof mb==="object"&&!Array.isArray(mb)&&
     mb.state==="referencia_materiales_sin_precio_final"&&
     ["ranking_final","iva_calculado","flete_calculado",
      "stock_confirmado","contactos_revelados","adjudicacion",
      "originales_descargables","whatsapp_enviado"].every(k=>mb[k]===false)&&
     mb.quotations===safe.offers?.length&&
     mb.quotations===safe.item_prices.quotations&&
     mb.requested_items===safe.item_prices.requested_items&&
     Array.isArray(mb.ofertas)&&mb.ofertas.length===mb.quotations&&
     Array.isArray(mb.opciones)&&mb.opciones.length<=55){
    const labels=safe.offers.map(o=>o.label);
    const lineItems=safe.item_prices.articulos;
    const labelsWithAmount=new Map(labels.map(label=>[label,0]));
    for(const item of lineItems)for(const ref of item.referencias){
      if(ref.importeCotizado!==null)
        labelsWithAmount.set(ref.oferta,labelsWithAmount.get(ref.oferta)+1);
    }
    const exclusionCodes=new Set([
      "fuente_no_acreditada","iva_incluido_no_normalizado",
      "tratamiento_iva_ambiguo","iva_silencioso_inconsistente",
      "moneda_contradictoria_en_original","moneda_sin_acreditar",
      "hecho_fuente_inconsistente","importe_fuente_no_conciliado",
      "sin_lineas_asignadas","prueba_bolson_invalida",
      "prueba_envase_obra_invalida","equivalencia_o_asignacion_sin_acreditar",
      "unidad_sin_acreditar","cantidad_incompatible",
      "cargos_o_lineas_sin_asignar"
    ]);
    const warningCodes=new Set([
      "iva_no_informado","flete_no_incluido_en_comparacion",
      "stock_no_corroborado","minimos_y_pago_no_evaluados",
      "bolson_1m3_nominal_sin_stock",
      "presentacion_envase_diferente_misma_cantidad_sin_stock"
    ]);
    const perOffer=mb.ofertas.every((o,i)=>o&&typeof o==="object"&&
      !Array.isArray(o)&&o.oferta===labels[i]&&
      Number.isSafeInteger(o.articulosConBase)&&o.articulosConBase>=0&&
      o.articulosConBase<=labelsWithAmount.get(o.oferta)&&
      (o.motivo===null||exclusionCodes.has(o.motivo)));
    const economics=new Map(safe.economic_readiness.ofertas.map(x=>[x.oferta,x]));
    const itemMoney=(literal,currency)=>{
      if(typeof literal!=="string")return null;
      const prefix=currency==="ARS"?/^\s*AR\$\s*/i:
        /^(?:\s*(?:US\$|U\$S|USD\s*\$?)\s*)/i;
      if(!prefix.test(literal))return null;
      const text=literal.replace(prefix,"").trim();
      let major,minor;
      if(/^(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(text)){
        [major,minor]=text.split(",");
        major=major.replace(/\./g,"");
      }else if(/^\d+\.\d{2}$/.test(text)){
        [major,minor]=text.split(".");
      }else if(/^\d+$/.test(text)){major=text;minor="00"}
      else return null;
      try{
        const cents=BigInt(major)*100n+BigInt(minor);
        return cents>=0n&&cents<=1000000000000n?cents:null;
      }catch{return null}
    };
    const options=[],seenOptions=new Set();
    let valid=perOffer&&economics.size===labels.length;
    if(valid)for(const option of mb.opciones){
      if(!option||typeof option!=="object"||Array.isArray(option)||
         !Array.isArray(option.ofertasAnonimas)||
         option.ofertasAnonimas.length<1||option.ofertasAnonimas.length>2||
         new Set(option.ofertasAnonimas).size!==option.ofertasAnonimas.length||
         option.ofertasAnonimas.some(label=>!labels.includes(label))||
         (option.moneda!=="ARS"&&option.moneda!=="USD")||
         !/^(?:0|[1-9]\d{0,11})\.\d{2}$/.test(option.subtotalMaterialesSinIva)||
         !Array.isArray(option.asignacion)||
         option.asignacion.length!==lineItems.length||
         !Array.isArray(option.advertencias)||
         option.advertencias.length<3||option.advertencias.length>6||
         new Set(option.advertencias).size!==option.advertencias.length||
         option.advertencias.some(w=>!warningCodes.has(w))||
         ["flete_no_incluido_en_comparacion",
          "stock_no_corroborado","minimos_y_pago_no_evaluados"]
          .some(w=>!option.advertencias.includes(w))){valid=false;break}
      const used=new Set(),assign=[],subtotal=[];
      for(let n=0;n<lineItems.length;n++){
        const row=option.asignacion[n],item=lineItems[n];
        if(!row||row.itemId!==item.itemId||
           !option.ofertasAnonimas.includes(row.oferta)||
           economics.get(row.oferta)?.moneda!==option.moneda){valid=false;break}
        const priced=item.referencias.find(x=>x.oferta===row.oferta);
        if(!priced||priced.importeCotizado===null||
           !["alternativa_comercial_con_aclaracion",
             "coincide_volumen_nominal_sin_stock"].includes(priced.estado)||
           !["sin_iva_por_convencion","sin_iva_declarado"].includes(priced.iva)){
          valid=false;break;
        }
        const cents=itemMoney(priced.importeCotizado,option.moneda);
        if(cents===null){valid=false;break}
        subtotal.push(cents);used.add(row.oferta);
        assign.push({itemId:row.itemId,oferta:row.oferta});
      }
      if(!valid)break;
      if(used.size!==option.ofertasAnonimas.length){valid=false;break}
      const withUnknown=option.ofertasAnonimas.some(label=>
        economics.get(label).iva==="no_informado");
      if(option.advertencias.includes("iva_no_informado")!==withUnknown){
        valid=false;break;
      }
      const sum=subtotal.reduce((acc,x)=>acc+x,0n);
      const formatted=String(sum/100n)+"."+String(sum%100n).padStart(2,"0");
      const key=option.moneda+":"+option.ofertasAnonimas.join("|")+":"+
        assign.map(x=>x.oferta).join("|");
      if(formatted!==option.subtotalMaterialesSinIva||
         seenOptions.has(key)){valid=false;break}
      seenOptions.add(key);
      options.push({
        ofertasAnonimas:option.ofertasAnonimas.slice(),
        moneda:option.moneda,
        subtotalMaterialesSinIva:formatted,
        asignacion:assign,advertencias:option.advertencias.slice()
      });
    }
    if(valid){
      safe.material_baskets={
        state:"referencia_materiales_sin_precio_final",
        quotations:labels.length,requested_items:lineItems.length,
        ofertas:mb.ofertas.map(o=>({
          oferta:o.oferta,articulosConBase:o.articulosConBase,
          motivo:o.motivo
        })),
        opciones:options,
        ranking_final:false,iva_calculado:false,flete_calculado:false,
        stock_confirmado:false,contactos_revelados:false,
        adjudicacion:false,originales_descargables:false,
        whatsapp_enviado:false
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
    if(body.length>524288)return res.status(502).json({state:"unavailable"});
    const safe=buyerView(JSON.parse(body));
    if(!safe)return res.status(502).json({state:"unavailable"});
    return res.status(200).json(safe);
  }catch{return res.status(502).json({state:"unavailable"});}
}
