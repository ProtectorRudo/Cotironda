'use client';
import {useMemo,useState,type FormEvent} from 'react';
import {createClient} from '@supabase/supabase-js';

const PILOT_URL='https://ilggkalaafhtiysyzlmg.supabase.co';
type Stage='login'|'mfa'|'ready';
type Item=Readonly<{messageHmac:string;supplierKey:string;receivedAt:string}>;
type Evidence=Readonly<{
 messageHmac:string;noticeMessageHmac:string;supplierKey:string;
 termsBody:string;termsVersion:string;termsSha256:string;
 plaintextSha256:string;receivedAt:string;text:string;
}>;
function isRecord(v:unknown):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v);
}
const HASH=/^[a-f0-9]{64}$/u;
export function PanelRevisionTerminos({publishableKey}:{publishableKey:string}){
 const client=useMemo(()=>createClient(PILOT_URL,publishableKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
 }),[publishableKey]);
 const [stage,setStage]=useState<Stage>('login');
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [totp,setTotp]=useState(''),[factorId,setFactorId]=useState('');
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [items,setItems]=useState<Item[]>([]);
 const [evidence,setEvidence]=useState<Evidence|null>(null);
 const [attested,setAttested]=useState(false);
 async function ingresar(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(busy||!email.includes('@')||password.length<8)return;
  setBusy(true);setNotice('');
  try{
   const {error}=await client.auth.signInWithPassword({email,password});
   setPassword('');
   if(error)throw Error('credenciales');
   const {data:aal,error:aalErr}=
     await client.auth.mfa.getAuthenticatorAssuranceLevel();
   if(aalErr)throw Error('mfa');
   if(aal.currentLevel==='aal2'){
    setStage('ready');setNotice('Sesión autenticada con doble factor.');
    return;
   }
   const {data:factors,error:factorsError}=await client.auth.mfa.listFactors();
   const factor=factors?.totp?.find(f=>f.status==='verified');
   if(factorsError||!factor){
    await client.auth.signOut();
    throw Error('mfa_no_disponible');
   }
   setFactorId(factor.id);setStage('mfa');
   setNotice('Ingresá el código de tu aplicación autenticadora.');
  }catch{
   setPassword('');
   setNotice('No se pudo ingresar con un operador MFA habilitado.');
  }finally{setBusy(false)}
 }
 async function verificar(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(busy||!factorId||!/^[0-9]{6}$/u.test(totp))return;
  setBusy(true);setNotice('');
  try{
   const {error}=await client.auth.mfa.challengeAndVerify({
    factorId,code:totp
   });
   setTotp('');
   if(error)throw Error('mfa');
   const {data:aal,error:aalError}=
     await client.auth.mfa.getAuthenticatorAssuranceLevel();
   if(aalError||aal.currentLevel!=='aal2')throw Error('aal');
   setStage('ready');
   setNotice('Doble factor verificado. Ya podés revisar respuestas.');
  }catch{
   setTotp('');
   setNotice('Código no válido o sesión vencida.');
  }finally{setBusy(false)}
 }
 async function call(action:'bandeja'|'preparar'|'decidir',body:Record<string,unknown>):
 Promise<unknown>{
  // The browser session is never a trusted authorization decision.
  // Supabase Auth getUser + the live M267 SQL session independently verify it.
  const {data,error}=await client.auth.getSession();
  const token=data.session?.access_token;
  if(error||!token)throw Error('sesion');
  const r=await fetch('/api/piloto/operador/terminos/'+action,{
   method:'POST',redirect:'error',cache:'no-store',credentials:'omit',
   headers:{'content-type':'application/json','authorization':'Bearer '+token},
   body:JSON.stringify(body)
  });
  if(!r.ok)throw Error('revision');
  return r.json() as Promise<unknown>;
 }
 async function cargar(){
  if(busy||stage!=='ready')return;
  setBusy(true);setNotice('');setEvidence(null);setAttested(false);
  try{
   const v=await call('bandeja',{});
   if(!isRecord(v)||v.state!=='ready'||!Array.isArray(v.items)||
      v.items.length>12)throw Error('datos');
   const next:Item[]=[];
   for(const row of v.items){
    if(!isRecord(row)||typeof row.messageHmac!=='string'||
      !HASH.test(row.messageHmac)||typeof row.supplierKey!=='string'||
      typeof row.receivedAt!=='string')throw Error('datos');
    next.push({messageHmac:row.messageHmac,supplierKey:row.supplierKey,
     receivedAt:row.receivedAt});
   }
   setItems(next);
   if(next.length===0)setNotice('No hay respuestas pendientes para revisar.');
  }catch{setNotice('No se pudo consultar la bandeja privada.');}
  finally{setBusy(false)}
 }
 async function preparar(messageHmac:string){
  if(busy||stage!=='ready'||!HASH.test(messageHmac))return;
  setBusy(true);setNotice('');setEvidence(null);setAttested(false);
  try{
   const v=await call('preparar',{messageHmac});
   if(!isRecord(v)||v.state!=='ready'||v.messageHmac!==messageHmac||
      typeof v.noticeMessageHmac!=='string'||
      typeof v.plaintextSha256!=='string'||
      typeof v.supplierKey!=='string'||typeof v.termsBody!=='string'||
      typeof v.termsVersion!=='string'||typeof v.termsSha256!=='string'||
      typeof v.receivedAt!=='string'||typeof v.text!=='string')
     throw Error('datos');
   setEvidence({
    messageHmac,noticeMessageHmac:v.noticeMessageHmac,
    supplierKey:v.supplierKey,termsBody:v.termsBody,
    termsVersion:v.termsVersion,termsSha256:v.termsSha256,
    plaintextSha256:v.plaintextSha256,receivedAt:v.receivedAt,
    text:v.text
   });
  }catch{setNotice('No se pudo verificar el mensaje.');}
  finally{setBusy(false)}
 }
 async function decidir(decision:'explicit_accept'|'not_explicit'){
  if(!evidence||!attested||busy||stage!=='ready')return;
  setBusy(true);setNotice('');
  try{
   const v=await call('decidir',{
    messageHmac:evidence.messageHmac,
    noticeMessageHmac:evidence.noticeMessageHmac,
    reviewedPlaintextSha256:evidence.plaintextSha256,
    decision,humanAttestation:true
   });
   if(!isRecord(v)||v.state!=='recorded'||v.decision!==decision)
     throw Error('resultado');
   setEvidence(null);setAttested(false);setItems([]);
   setNotice(decision==='explicit_accept'?
    'Aceptación expresa registrada. No habilita rondas anteriores.':
    'Revisión registrada sin otorgar autorización.');
  }catch{setNotice('La decisión no se registró. Revisá la sesión y la evidencia.');}
  finally{setBusy(false)}
 }
 async function salir(){
  setEvidence(null);setAttested(false);setItems([]);
  setPassword('');setTotp('');setFactorId('');setEmail('');
  setStage('login');setNotice('');
  try{await client.auth.signOut()}catch{ /* No show credentials/errors. */ }
 }
 return <section aria-label="Panel de revisión privada">
  {stage==='login'&&<form onSubmit={ingresar}>
   <h2>Ingresar como operador</h2>
   <label htmlFor="operator-email">Correo autorizado</label>
   <input id="operator-email" type="email" autoComplete="username"
    required maxLength={254} value={email}
    onChange={e=>setEmail(e.target.value)}/>
   <label htmlFor="operator-password">Contraseña</label>
   <input id="operator-password" type="password" autoComplete="current-password"
    required minLength={8} value={password}
    onChange={e=>setPassword(e.target.value)}/>
   <button type="submit" disabled={busy}>Ingresar</button>
   <p>Solo cuentas previamente habilitadas. Esta pantalla no crea usuarios.</p>
  </form>}
  {stage==='mfa'&&<form onSubmit={verificar}>
   <h2>Verificar segundo factor</h2>
   <label htmlFor="operator-totp">Código de tu autenticador</label>
   <input id="operator-totp" inputMode="numeric" autoComplete="one-time-code"
    value={totp} maxLength={6} pattern="[0-9]{6}"
    onChange={e=>setTotp(e.target.value)} required/>
   <div><button type="submit" disabled={busy}>Verificar código</button>
   <button type="button" disabled={busy} onClick={()=>void salir()}>
    Cancelar</button></div>
  </form>}
  {stage==='ready'&&<>
   <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBlock:14}}>
    <button type="button" disabled={busy} onClick={()=>void cargar()}>
     Consultar respuestas pendientes</button>
    <button type="button" disabled={busy} onClick={()=>void salir()}>
     Cerrar sesión</button>
   </div>
   {!evidence&&<div>
    <h2>Respuestas por revisar</h2>
    {items.length===0&&<p>Consultá la bandeja. No se muestran teléfonos.</p>}
    <ul>{items.map(item=><li key={item.messageHmac}>
     <span>Proveedor: {item.supplierKey}. Recibido: {item.receivedAt}.</span>{' '}
     <button type="button" disabled={busy}
      onClick={()=>void preparar(item.messageHmac)}>Revisar mensaje</button>
    </li>)}</ul>
   </div>}
   {evidence&&<article>
    <h2>Revisión humana de evidencia</h2>
    <p><strong>Proveedor:</strong> {evidence.supplierKey}</p>
    <p><strong>Versión:</strong> {evidence.termsVersion}</p>
    <h3>Condiciones que Cotironda envió</h3>
    <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>
     {evidence.termsBody}
    </pre>
    <h3>Respuesta original del proveedor</h3>
    <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>
     {evidence.text}
    </pre>
    <label style={{display:'block',marginBlock:16}}>
     <input type="checkbox" checked={attested}
      onChange={e=>setAttested(e.target.checked)}/>
     Leí personalmente las condiciones y la respuesta completa, y verifico
     que mi decisión refleja lo escrito por el proveedor.
    </label>
    <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
     <button type="button" disabled={!attested||busy}
      onClick={()=>void decidir('explicit_accept')}>
      Registrar aceptación expresa</button>
     <button type="button" disabled={!attested||busy}
      onClick={()=>void decidir('not_explicit')}>
      No hay aceptación expresa</button>
     <button type="button" disabled={busy}
      onClick={()=>{setEvidence(null);setAttested(false)}}>
      Volver sin decidir</button>
    </div>
    <p>Ante cualquier ambigüedad, elegí «No hay aceptación expresa».
     La aprobación nunca se aplica retroactivamente.</p>
   </article>}
  </>}
  {notice&&<p role="status" aria-live="polite">{notice}</p>}
 </section>;
}
