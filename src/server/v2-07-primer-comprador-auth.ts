/** Cotironda V2-07 — bootstrap ONLY for the first authorized PILOT buyer.
 * No user signup in the browser. No logging of phone, key, secret or UUID.
 * Operator must verify company and phone in the existing WhatsApp identity.
 */
import {createHash} from 'node:crypto';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const PHONE=/^\+[1-9][0-9]{7,14}$/u; // E.164: 8 a 15 dígitos, sin contar el +
const BUYER=/^[a-z0-9_-]{3,100}$/u;
const SHA=/^[a-f0-9]{40}$/u;
const PROVIDER=/^[a-z][a-z0-9_-]{2,63}$/u;
/** Estado públicamente observable de GoTrue. NO prueba entrega real SMS.
 * Bloquea creación de una cuenta inaccesible o auto-confirmada.
 */
/** Solo booleanos de configuración públicamente anunciada: nunca expone
 * proveedor, teléfono o credenciales. false también cubre dato ausente.
 */
export type InspeccionSmsInicialV2=Readonly<{
 signupClosed:boolean;
 phoneEnabled:boolean;
 autoConfirmDisabled:boolean;
 smsProviderReady:boolean;
}>;
export function inspeccionarConfiguracionSmsInicialV2(
 input:unknown
):InspeccionSmsInicialV2{
 const vacio=()=>Object.freeze({
  signupClosed:false,phoneEnabled:false,
  autoConfirmDisabled:false,smsProviderReady:false
 });
 if(!input||typeof input!=='object'||Array.isArray(input))return vacio();
 const s=input as Record<string,unknown>;
 const ext=s.external&&typeof s.external==='object'&&
  !Array.isArray(s.external)
  ?s.external as Record<string,unknown>:null;
 const provider=s.sms_provider;
 return Object.freeze({
  signupClosed:s.disable_signup===true,
  phoneEnabled:ext?.phone===true,
  autoConfirmDisabled:s.phone_autoconfirm===false,
  smsProviderReady:typeof provider==='string'&&PROVIDER.test(provider)&&
   !['none','disabled','unknown','test','fake','noop','mock'].includes(provider)
 });
}
export function configuracionSmsInicialV2Lista(input:unknown):boolean{
 const d=inspeccionarConfiguracionSmsInicialV2(input);
 return d.signupClosed&&d.phoneEnabled&&
  d.autoConfirmDisabled&&d.smsProviderReady;
}
export type BootstrapBuyerPorts=Readonly<{
 countExistingAuthUsers:()=>Promise<number|null>;
 /** GET público /auth/v1/settings: sin tokens de usuario ni mutaciones. */
 readPublicAuthSettings:()=>Promise<unknown>;
 isVerifiedBuyerPhone:(buyerKey:string,phoneJidSHA:string)=>Promise<boolean>;
 createUnconfirmedUser:(e164:string)=>Promise<Readonly<{
  created:boolean;phoneConfirmed:boolean;
 }>>;
}>;
export type BootstrapBuyerArgs=Readonly<{
 projectUrl:string;
 buyerKey:string;
 phoneE164:string;
 mode:'dry-run'|'execute';
 previewOnly:boolean;
 registrationClosed:boolean;
 activeSourceSha:string;
 approvedSourceSha:string;
 explicitApproval?:string;
}>;
export type BootstrapBuyerResult=Readonly<{
 state:'BLOCKED'|'READY_DRY_RUN'|'CREATED_UNCONFIRMED_AWAITING_SMS';
 code:string;
 userCreated:boolean;
 smsSent:false;
 secretsExposed:false;
}>;

const result=(state:BootstrapBuyerResult['state'],code:string,
 userCreated=false):BootstrapBuyerResult=>Object.freeze({
 state,code,userCreated,smsSent:false,secretsExposed:false
});
export function phoneWhatsappContactSHA(phone:string):string|null{
 if(!PHONE.test(phone))return null;
 // Match precisely the existing V2-03 SQL formula: no leading plus.
 return createHash('sha256').update(phone.slice(1)+'@s.whatsapp.net','utf8')
  .digest('hex');
}

/** Executing cannot be authorized by a chat response alone: an operator must
 * supply a separate release-scoped approval token to the isolated CLI.
 * No admin createUser unless stored buyer identity matches exactly.
 */
export async function bootstrapPrimerCompradorV2(
 args:BootstrapBuyerArgs,ports:BootstrapBuyerPorts
):Promise<BootstrapBuyerResult>{
 if(!args||args.projectUrl!==PILOT||
  args.previewOnly!==true||args.registrationClosed!==true||
  !['dry-run','execute'].includes(args.mode)||
  typeof args.buyerKey!=='string'||!BUYER.test(args.buyerKey)||
  typeof args.phoneE164!=='string'||!PHONE.test(args.phoneE164))
  return result('BLOCKED','identidad_o_entorno_invalido');
 if(!SHA.test(args.activeSourceSha)||!SHA.test(args.approvedSourceSha)||
  args.activeSourceSha!==args.approvedSourceSha)
  return result('BLOCKED','commit_de_release_no_coincide');
 if(args.mode==='execute'&&
  args.explicitApproval!=='PUBLICALO_SOLO_COTIRONDA_PILOTO_AUTH_V2')
  return result('BLOCKED','aprobacion_de_publicacion_ausente');
 const contactSHA=phoneWhatsappContactSHA(args.phoneE164);
 if(!contactSHA)return result('BLOCKED','telefono_invalido');
 try{
  const users=await ports.countExistingAuthUsers();
  // First buyer ONLY. Do not convert this into a public registration path.
  if(users!==0)return result('BLOCKED','alta_inicial_ya_realizada_o_no_verificada');
  const permitted=await ports.isVerifiedBuyerPhone(args.buyerKey,contactSHA);
  if(permitted!==true)
   return result('BLOCKED','comprador_o_canal_whatsapp_no_verificado');
  // El frontend tiene shouldCreateUser:false, pero eso no configura
  // el proveedor de SMS ni impide altas directas contra GoTrue.
  // Nunca crear Auth antes de comprobar la configuración pública actual.
  if(!configuracionSmsInicialV2Lista(await ports.readPublicAuthSettings()))
   return result('BLOCKED','proveedor_sms_o_signup_auth_no_configurados');
  // Prevent stale preflight or a parallel operator from adding a second user.
  if(args.mode==='dry-run')return result('READY_DRY_RUN','preparado_sin_modificaciones');
  const again=await ports.countExistingAuthUsers();
  if(again!==0)return result('BLOCKED','alta_inicial_compite_con_otra');
  // NEVER auto-confirm phone here; Supabase OTP must prove possession.
  const created=await ports.createUnconfirmedUser(args.phoneE164);
  if(created.created!==true)return result('BLOCKED','supabase_rechazo_alta');
  if(created.phoneConfirmed===true)
   return result('BLOCKED','alta_no_cumplio_verificacion_sms',true);
  return result('CREATED_UNCONFIRMED_AWAITING_SMS',
   'cuenta_creada_no_verificada_hasta_otp',true);
 }catch{
  return result('BLOCKED','servicio_auth_o_evidencia_no_disponible');
 }
}
