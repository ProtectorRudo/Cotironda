/**
 * MVP-009 / D059: privileged SERVER-ONLY PostgreSQL port for inbound quotes.
 * No HTTP endpoint, no Whapi client, no secrets, no connection allocation.
 *
 * IMPORTANT: quote is NOT sourced from webhook payload directly. A future
 * authenticated broker must decrypt the persisted D028 inbox, verify source,
 * associate the real material/amount and normalize tax/freight evidence.
 * D059 then rechecks inbox identity, opt-in, invitation and round in SQL.
 *
 * Receiving the supplier's quote is sufficient; do NOT send "Confirmo".
 */
export type DbRecepcionD059=Readonly<{
 query:(sql:string,params:readonly unknown[])=>Promise<Readonly<{
  rows:readonly Record<string,unknown>[];
 }>>;
}>;
export type CotizacionNormalizadaD059=Readonly<{
 currency:'ARS'|'USD';
 payment_method:'contado'|'transferencia'|'cuenta_corriente_30_dias'|null;
 lead_days:number|null;
 freight_gross:string|null;
 min_goods_gross:string|null;
 lines_snapshot:readonly Readonly<{
  line_no:number;
  unit:'unit'|'bag'|'box'|'kg'|'g'|'l'|'ml'|'m'|'m2'|'m3'|'roll'|'pack';
  available_qty:string;
  net_unit_price:string|null;
  vat_rate:'0'|'10.5'|'21'|null;
 }>[];
}>;
export type ReciboD059=Readonly<{
 estado:'cotizacion_recibida_sin_confirmacion_extra';
 revision:number;
 version:number;
 repetido:boolean;
}>;
const SQL='select cotironda_private.whapi_receive_quote_d059($1::text,$2::text,$3::integer,$4::jsonb) as payload';
const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/u;
const SHA=/^[a-f0-9]{64}$/u;
const MONEY=/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/u;
const COUNT=/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/u;
const UNIT=new Set(['unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack']);
const PAYMENT=new Set(['contado','transferencia','cuenta_corriente_30_dias']);
const IVA=new Set(['0','10.5','21']);
function fail():never{throw new Error('d059_cotizacion_no_disponible')}
function obj(x:unknown):x is Record<string,unknown>{
 return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function exact(x:unknown,keys:readonly string[]):x is Record<string,unknown>{
 return obj(x)&&Object.keys(x).length===keys.length&&
   Object.keys(x).every(k=>keys.includes(k));
}
function monto(x:unknown):boolean{return typeof x==='string'&&MONEY.test(x)}
function decimal(x:unknown):boolean{return typeof x==='string'&&COUNT.test(x)&&Number(x)>0}
function int(x:unknown,min:number,max:number):boolean{
 return typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max;
}
const FIELDS=['currency','payment_method','lead_days','freight_gross','min_goods_gross','lines_snapshot'];
const ITEM_FIELDS=['line_no','unit','available_qty','net_unit_price','vat_rate'];
function validarQuote(quote:unknown):asserts quote is CotizacionNormalizadaD059{
 if(!exact(quote,FIELDS)||!['ARS','USD'].includes(String(quote.currency))||
   !(quote.payment_method===null||PAYMENT.has(String(quote.payment_method)))||
   !(quote.lead_days===null||int(quote.lead_days,0,120))||
   !(quote.freight_gross===null||monto(quote.freight_gross))||
   !(quote.min_goods_gross===null||monto(quote.min_goods_gross))||
   !Array.isArray(quote.lines_snapshot)||quote.lines_snapshot.length<1||
   quote.lines_snapshot.length>8)fail();
 const seen=new Set<number>();
 for(const line of quote.lines_snapshot){
  if(!exact(line,ITEM_FIELDS)||!int(line.line_no,1,8)||
    seen.has(line.line_no as number)||!UNIT.has(String(line.unit))||
    !decimal(line.available_qty)||
    !(line.net_unit_price===null||monto(line.net_unit_price))||
    !(line.vat_rate===null||IVA.has(String(line.vat_rate))))fail();
  seen.add(line.line_no as number);
 }
}
export function crearPuertoRecepcionDirectaD059(db:DbRecepcionD059){
 if(!db||typeof db.query!=='function')fail();
 async function registrar(args:Readonly<{
  channel:string;
  messageKey:string;
  expectedRevision:number;
  quote:CotizacionNormalizadaD059;
 }>):Promise<ReciboD059>{
  if(!exact(args,['channel','messageKey','expectedRevision','quote'])||
    typeof args.channel!=='string'||!CHANNEL.test(args.channel)||
    typeof args.messageKey!=='string'||!SHA.test(args.messageKey)||
    !int(args.expectedRevision,0,99999))fail();
  validarQuote(args.quote);
  let raw:unknown;
  try{
   const data=await db.query(SQL,[args.channel,args.messageKey,
     args.expectedRevision,JSON.stringify(args.quote)]);
   if(!obj(data)||!Array.isArray(data.rows)||data.rows.length!==1||
     !exact(data.rows[0],['payload']))fail();
   raw=data.rows[0].payload;
  }catch{fail();}
  if(!exact(raw,['state','revision','version','repeated'])||
    raw.state!=='offer_received'||!int(raw.revision,1,100000)||
    !int(raw.version,1,100000)||typeof raw.repeated!=='boolean'||
    raw.revision!==args.expectedRevision+1)fail();
  return Object.freeze({
   estado:'cotizacion_recibida_sin_confirmacion_extra',
   revision:raw.revision as number,
   version:raw.version as number,
   repetido:raw.repeated as boolean
  });
 }
 return Object.freeze({registrar});
}
