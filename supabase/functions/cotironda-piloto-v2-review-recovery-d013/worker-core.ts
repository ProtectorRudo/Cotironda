/** D013: control de UNA operación privada, después del guard Vault MVP132.
 * No habilita nuevos envíos ni autenticación del navegador. Sólo check/execute.
 */
export const SQL_D013_APPROVED_COMMIT='2fdc9288c7a3d6f53f3f4281150197a7a4fc897b';
type Resultado=Readonly<{estado:string;requestId:string|null;outboundSent:false}>;
type Recover=(execute:boolean)=>Promise<Resultado>;
type Diagnose=()=>Promise<{estado:string;outboundSent:false;
 diagnostico:unknown}>;
const categorias=new Set(['cantidad_inacreditable','sin_fallo_cantidad',
 'esquema_invalido','citas_invalidas','modelo_no_disponible']);
const mascaras=new Set(['numero_decimal','numero_entero','numero_confuso',
 'separador','numero_en_palabras','palabra_oculta',
 'envase_bag','envase_bigbag','envase_bucket','envase_roll',
 'envase_box','envase_pack','envase_unit',
 'unidad_fisica_m','unidad_fisica_m2','unidad_fisica_m3',
 'unidad_fisica_mm','unidad_fisica_cm','unidad_fisica_cm2',
 'unidad_fisica_mm2','unidad_fisica_cm3','unidad_fisica_mm3',
 'unidad_fisica_kg','unidad_fisica_g','unidad_fisica_mg',
 'unidad_fisica_t','unidad_fisica_l','unidad_fisica_ml',
 'unidad_fisica_cl','unidad_fisica_dl','unidad_fisica_km']);
const lineas=new Set(['inicio_linea','tras_prefijo','mitad_linea']);
const contextos=new Set(['vacio','con_numeros','sin_numeros']);
const citas=new Set(['vacia','numero_legible',
 'numero_ilegible','texto_ilegible']);
const clasesNumero=new Set(['entero','decimal','invalido']);
function resumenSeguro(value:unknown):Record<string,unknown>|null{
 if(value===null||typeof value!=='object'||Array.isArray(value))
  return null;
 const d=value as Record<string,unknown>;
 if(!categorias.has(String(d.estado)))return null;
 if(d.detalle===null)return {estado:d.estado,detalle:null};
 const x=d.detalle;
 if(x===null||typeof x!=='object'||Array.isArray(x))return null;
 const t=x as Record<string,unknown>;
 if(!Number.isSafeInteger(t.indiceArticulo)||Number(t.indiceArticulo)<0||
  Number(t.indiceArticulo)>199||
  !Number.isSafeInteger(t.indiceLinea)||Number(t.indiceLinea)<0||
  Number(t.indiceLinea)>199||
  !lineas.has(String(t.posicionTramo))||
  !contextos.has(String(t.prefijoLinea))||
  !contextos.has(String(t.sufijoLinea))||
  !citas.has(String(t.citaTipo))||
  !clasesNumero.has(String(t.numeroModeloTipo))||
  typeof t.citaDentroTramo!=='boolean'||
  typeof t.truncado!=='boolean'||
  !Array.isArray(t.estructuraTramo)||t.estructuraTramo.length>24||
  t.estructuraTramo.some((z:unknown)=>!mascaras.has(String(z))))
  return null;
 // Reconstrucción explícita: propiedades extra, PII o mensajes del modelo
 // quedan fuera incluso si una función interna falla o es manipulada.
 return {estado:d.estado,detalle:{
  indiceArticulo:t.indiceArticulo,indiceLinea:t.indiceLinea,
  posicionTramo:t.posicionTramo,prefijoLinea:t.prefijoLinea,
  sufijoLinea:t.sufijoLinea,citaTipo:t.citaTipo,
  citaDentroTramo:t.citaDentroTramo,
  numeroModeloTipo:t.numeroModeloTipo,
  estructuraTramo:t.estructuraTramo,
  truncado:t.truncado
 }};
}
const body=(status:number,state:string)=>new Response(JSON.stringify({state}),{
 status,headers:{'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff'}
});
async function readBounded(req:Request):Promise<unknown>{
 const declared=req.headers.get('content-length');
 if(declared!==null&&(!/^[0-9]{1,3}$/u.test(declared)||Number(declared)>64))
  return null;
 if(!/^application\/json(?:;|$)/iu.test(req.headers.get('content-type')??''))
  return null;
 const reader=req.body?.getReader();
 if(!reader)return null;
 const parts:Uint8Array[]=[];let bytes=0;
 try{
  while(true){
   const part=await reader.read();
   if(part.done)break;
   bytes+=part.value.length;
   if(bytes>64){await reader.cancel();return null}
   parts.push(part.value);
  }
 }finally{reader.releaseLock()}
 const data=new Uint8Array(bytes);let offset=0;
 for(const chunk of parts){data.set(chunk,offset);offset+=chunk.length}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data))}
 catch{return null}
}
/** La autorización Vault de 96 hex + SQL debe haberse verificado antes de
 * esta función. La operación jamás recibe teléfono, HMAC ni texto del cliente.
 */
export async function ejecutarRecuperacionVaultD013(req:Request,args:{
 enabled:boolean;recover:Recover;diagnose?:Diagnose
}):Promise<Response>{
 if(req.method!=='POST')return body(405,'method_not_allowed');
 if(args.enabled!==true)return body(503,'recovery_disabled');
 const value=await readBounded(req);
 if(!value||typeof value!=='object'||Array.isArray(value)||
  Object.keys(value).length!==1||
  !Object.hasOwn(value,'action'))return body(400,'invalid_action');
 const action=(value as Record<string,unknown>).action;
 if(action!=='check'&&action!=='execute'&&action!=='diagnose')
  return body(400,'invalid_action');
 if((action==='execute'||action==='diagnose')&&
  req.headers.get('x-cotironda-d013-release')!==SQL_D013_APPROVED_COMMIT)
  return body(403,'release_not_authorized');
 try{
  if(action==='diagnose'){
   if(typeof args.diagnose!=='function')
    return body(503,'diagnosis_disabled');
   const state=await args.diagnose();
   if(state.outboundSent!==false||state.estado!=='diagnostico_seguro')
    return body(409,'diagnosis_requires_review');
   const safe=resumenSeguro(state.diagnostico);
   if(!safe)return body(503,'invalid_diagnosis');
   return new Response(JSON.stringify({state:'diagnosis_verified',
    diagnosis:safe}),{status:200,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store','x-content-type-options':'nosniff'
   }});
  }
  const state=await args.recover(action==='execute');
  // El ID de ronda y los mensajes originales NO salen por la API del worker.
  if(state.outboundSent!==false)return body(503,'unexpected_dispatch');
  if(action==='check')return state.estado==='source_verified'
    ?body(200,'source_verified'):body(409,'source_not_verified');
  return state.estado==='staged_no_send'
   ?body(200,'draft_created_no_dispatch')
   :body(409,'recovery_requires_review');
 }catch{return body(503,'recovery_unavailable')}
}
