/**
 * D033 / Issue #168: carga de secretos EXCLUSIVAMENTE del servidor.
 * Sin process.env global, sin proveedor de secretos acoplado ni HTTP.
 * El llamador debe suministrar un snapshot del gestor secreto del entorno.
 *
 * NUNCA importar en componentes cliente, ni registrar el objeto devuelto.
 * No es una activación del webhook: sigue sin haber ruta HTTP montada.
 */
import type {ConfigBrokerWhapi} from './whapi-crypto-broker.ts';

export type EntornoWhapi='development'|'test'|'production';
export type VariablesSecretas=Readonly<Record<string,string|undefined>>;
export type ConfiguracionSecretaD033=Pick<ConfigBrokerWhapi,
  'channel'|'secretoWebhook'|'claves'|'contenidoKeyId'|'clavesLectura'|'habilitado'>;

const KEY_ID=/^[a-z][a-z0-9_]{2,40}$/;
const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/;
const HEX32=/^[0-9a-f]{64}$/;
const PREFIX='COTIRONDA_WHAPI_';
const LEGACY='legacy_d029';

function invalid():never{
  // Un mensaje uniforme evita que el error de configuración revele secretos,
  // nombres de cuentas, rutas o entorno al receptor HTTP.
  throw new Error('whapi_secret_config_invalid');
}
function parseKey(raw:unknown):Buffer{
  if(typeof raw!=='string'||!HEX32.test(raw))invalid();
  const out=Buffer.from(raw,'hex');
  // Rechazar secretos obviamente débiles o repetidos, no afirmar que esto
  // certifica calidad criptográfica de entropía.
  if(new Set(out).size<12)invalid();
  return out;
}
function validId(id:unknown):id is string{
  return typeof id==='string'&&KEY_ID.test(id)&&
    id!=='__proto__'&&id!=='constructor'&&id!=='prototype';
}
function validEnv(x:unknown):x is EntornoWhapi{
  return x==='development'||x==='test'||x==='production';
}
function ensureUnique(values:readonly Buffer[]):void{
  for(let i=0;i<values.length;i++){
    for(let j=i+1;j<values.length;j++){
      if(values[i].equals(values[j]))invalid();
    }
  }
}
function parseArchive(raw:unknown,activeId:string):Readonly<Record<string,Buffer>>{
  if(raw===undefined||raw==='')return Object.freeze(Object.create(null)) as Record<string,Buffer>;
  if(typeof raw!=='string'||raw.length>1450)invalid();
  let value:unknown;
  try{value=JSON.parse(raw)}catch{invalid()}
  if(!value||typeof value!=='object'||Array.isArray(value))invalid();
  const entries=Object.entries(value);
  if(entries.length>5)invalid();
  const result:Record<string,Buffer>=Object.create(null);
  for(const [id,hex] of entries){
    if(!validId(id)||id===activeId)invalid();
    result[id]=parseKey(hex);
  }
  return Object.freeze(result);
}
/**
 * Si ENABLE != true retorna null solo con flag ausente/'false'.
 * No lee secretos del host en forma implícita. Obliga al servicio a indicar
 * el entorno esperado (preferentemente hardcodeado en su configuración).
 */
export function cargarConfiguracionWhapiPrivada(
  vars:VariablesSecretas,entornoEsperado:EntornoWhapi
):ConfiguracionSecretaD033|null{
  if(!vars||typeof vars!=='object'||!validEnv(entornoEsperado))invalid();
  if(Object.keys(vars).some(k=>k.startsWith('NEXT_PUBLIC_'+PREFIX)))invalid();
  const enabled=vars.COTIRONDA_WHAPI_ENABLED;
  if(enabled===undefined||enabled==='false')return null;
  if(enabled!=='true')invalid();
  if(vars.COTIRONDA_WHAPI_RUNTIME!==entornoEsperado)invalid();
  const channel=vars.COTIRONDA_WHAPI_CHANNEL;
  const activeId=vars.COTIRONDA_WHAPI_AES_ACTIVE_ID;
  const secret=vars.COTIRONDA_WHAPI_WEBHOOK_SECRET_HEX;
  if(typeof channel!=='string'||!CHANNEL.test(channel)||
     !validId(activeId)||activeId===LEGACY||
     typeof secret!=='string'||!HEX32.test(secret)||
     new Set(Buffer.from(secret,'hex')).size<12)invalid();
  const claves={
    identidadHmac:parseKey(vars.COTIRONDA_WHAPI_HMAC_ID_HEX),
    huellaHmac:parseKey(vars.COTIRONDA_WHAPI_HMAC_FINGERPRINT_HEX),
    contenidoAes:parseKey(vars.COTIRONDA_WHAPI_AES_ACTIVE_HEX)
  };
  const historic=parseArchive(vars.COTIRONDA_WHAPI_AES_READ_KEYS_JSON,activeId);
  ensureUnique([...Object.values(claves),...Object.values(historic),
    Buffer.from(secret,'hex')]);
  return {
    habilitado:true,channel,secretoWebhook:secret,
    contenidoKeyId:activeId,
    claves:Object.freeze(claves),
    clavesLectura:historic
  };
}
export type UsoClaveAes=Readonly<{keyId:string;rows:number}>;
/**
 * Solo PRE-FLIGHT de retiro. El recuento debe provenir de una consulta
 * agregada autorizada a todas las filas persistidas, no del cliente.
 * Si falta cobertura de alguna clave activa/histórica, FALLAR CERRADO.
 */
export function verificarRetiroSeguroClaves(
  idsDisponibles:readonly string[],
  idsARetirar:readonly string[],
  conteosCompletos:readonly UsoClaveAes[]
):Readonly<{retirable:true;ids:readonly string[]}>{
  if(!Array.isArray(idsDisponibles)||!Array.isArray(idsARetirar)||
     !Array.isArray(conteosCompletos))invalid();
  const all=new Set(idsDisponibles);
  if(all.size!==idsDisponibles.length||!idsDisponibles.every(validId)||
     new Set(idsARetirar).size!==idsARetirar.length||
     !idsARetirar.every(x=>validId(x)&&all.has(x)))invalid();
  const countIds=new Set<string>();
  for(const c of conteosCompletos){
    if(!c||!validId(c.keyId)||!all.has(c.keyId)||
       countIds.has(c.keyId)||!Number.isSafeInteger(c.rows)||c.rows<0)invalid();
    countIds.add(c.keyId);
  }
  if(countIds.size!==all.size)invalid();
  if(idsARetirar.some(id=>conteosCompletos.find(x=>x.keyId===id)?.rows!==0))
    invalid();
  return Object.freeze({retirable:true,ids:Object.freeze([...idsARetirar])});
}
