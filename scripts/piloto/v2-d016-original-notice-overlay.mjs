/** D016/P0 #838 — candidato Whapi aislado para el aviso EN EL MISMO PDF.
 * Parte de MVP332 v76 inmutable + V2-02 + D016 acceso comprador; solamente
 * genera archivo de prueba, NO despliega ni modifica index.ts real.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generarWebhookD016} from './v2-d016-whapi-overlay.mjs';
import {inspeccionarWebhookMvp332} from './mvp332-whapi-bundle-readonly.mjs';

const THIS=fileURLToPath(import.meta.url);
const ROOT=resolve(dirname(THIS),'../..');
const ENTRY='supabase/functions/cotironda-piloto-whapi/index.ts';
const CANDIDATE='supabase/functions/cotironda-piloto-whapi/index.v2-d016-original-candidate.ts';
function once(raw,needle,replacement,name){
 const i=raw.indexOf(needle);
 if(i<0||raw.indexOf(needle,i+needle.length)!==-1)
  throw Error('d016_original_anchor_invalid:'+name);
 return raw.slice(0,i)+replacement+raw.slice(i+needle.length);
}
export function generarWebhookOriginalD016(original){
 let out=generarWebhookD016(original);
 const imp="import {notificarAccesoWhatsappD016} from './buyer-whatsapp-entry-d016.ts';";
 out=once(out,imp,imp+
  "\nimport {reservarAvisoOriginalEnDespachoD016,registrarResultadoOriginalD016}"+
  " from './original-notice-dispatch-d016.ts';",'import');
 const anchor=[
  '    createPdf:generarSolicitudPdfMvp091,',
  '    sendWhapi:async(recipient,pdf)=>{'
 ].join('\n');
 const hooks=[
  '    createPdf:generarSolicitudPdfMvp091,',
  "    // D016 P0: compuerta OFF; reserva antes del POST, sin segundo WhatsApp.",
  "    ...(Deno.env.get('COTIRONDA_PILOT_D016_ORIGINAL_NOTICE_ENABLED')==='true'?{",
  '      prepareOriginalNotice:async({requestId,supplierKey,chatHmac,leaseToken,recipient})=>{',
  "       const ref=Deno.env.get('COTIRONDA_PILOT_V2_REFERENCE_LINK_ENABLED')==='true'",
  '        ?etiquetaReferenciaPedidoV2(requestId):null;',
  "       const captionBase='Cotironda · Nueva solicitud de cotización.'+",
  "        (ref?'\\n'+ref:'');",
  '       return reservarAvisoOriginalEnDespachoD016({',
  '        enabled:true,requestId,supplierKey,chatHmac,leaseToken,recipient,',
  '        captionBase,rpc:async(name,params)=>{',
  '         const response=await db.rpc(name,params);',
  '         return {data:response.data,error:response.error};',
  '        }',
  '       });',
  '      },',
  '      confirmOriginalNotice:async({requestId,supplierKey,messageId})=>',
  '       registrarResultadoOriginalD016({',
  '        enabled:true,requestId,supplierKey,messageId,',
  '        rpc:async(name,params)=>{',
  '         const response=await db.rpc(name,params);',
  '         return {data:response.data,error:response.error};',
  '        }',
  '       })',
  '    }:{}),',
  '    sendWhapi:async(recipient,pdf,d016Caption)=>{'
 ].join('\n');
 out=once(out,anchor,hooks,'hooks');
 const oldCaption="       caption:CAPTION_PEDIDO_COTIRONDA_MVP305+(refCaption?'\\n'+refCaption:'')";
 const newCaption="       caption:d016Caption??(CAPTION_PEDIDO_COTIRONDA_MVP305+(refCaption?'\\n'+refCaption:''))";
 out=once(out,oldCaption,newCaption,'caption');
 if(!out.includes('prepareOriginalNotice:async(')||
  !out.includes('caption:d016Caption??(')||
  !out.includes('COTIRONDA_PILOT_D016_WHATSAPP_SEND_ENABLED')) {
  throw Error('d016_original_integration_incomplete');
 }
 return out;
}
if(process.argv[1]&&resolve(process.argv[1])===THIS){
 try{
  inspeccionarWebhookMvp332(ROOT);
  const raw=readFileSync(resolve(ROOT,ENTRY),'utf8');
  const output=generarWebhookOriginalD016(raw);
  if(process.argv.includes('--write-candidate')){
   writeFileSync(resolve(ROOT,CANDIDATE),output,'utf8');
   process.stdout.write('D016_ORIGINAL_WEBHOOK_CANDIDATE_GENERATED_NO_DEPLOY\n');
  } else process.stdout.write('D016_ORIGINAL_WEBHOOK_CANDIDATE_VALID_NO_WRITE\n');
 }catch(e){
  process.stderr.write(String(e?.message??'D016_original_invalid')+'\n');
  process.exitCode=1;
 }
}
