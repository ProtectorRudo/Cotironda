/**
 * D036 - Evaluación pura del inventario SQL de Supabase DEV.
 * CERO conexiones, variables de entorno, claves o cambios de base.
 * Un resultado conforme NO autoriza instalar: backup y E2E siguen pendientes.
 */
export const HISTORIAL_DEV_VALIDADO_D036=Object.freeze([
 ['20261029105736','initial_identity_catalog'],
 ['20261029111731','backend_role_limited'],
 ['20261029112947','execute_only_registration'],
 ['20261029120021','jwt_bound_registration_locked'],
 ['20261029122708','invoker_verified_email_hook'],
 ['20261029130907','session_revocation_and_verified_user'],
 ['20261029140422','registration_attempt_rate_limiter'],
 ['20261029183835','storage_private_buyer_drafts'],
 ['20261029202610','storage_session_revocation'],
 ['20261029211609','storage_upload_fail_closed'],
 ['20261029213755','private_quarantine_ledger'],
 ['20261029234236','commercial_session_guard'],
 ['20261030182413','dev_quality_once_only'],
 ['20261030190232','dev_quality_results_ledger'],
 ['20261030192011','dev_quality_auto_dispatch_d020'],
 ['20261030192221','dev_quality_pg_net_nonpublic_d020'],
 ['20261030194856','dev_quality_numeric_diagnostics_d021']
].map(([version,name])=>Object.freeze({version,name})));

export const PUERTAS_NO_VERIFICADAS_D036=Object.freeze([
 'Backup real de Supabase DEV y prueba de restauración/documentación de recuperación',
 'Revisar todos los SQL D024–D035, orden, grants, dueño y RLS en alojado',
 'Prueba con usuarios autenticados reales en PostgREST y sesión revocada',
 'Autorización explícita de instalación gradual y ventana de cambios DEV',
 'Verificar en entorno alojado Data API: grants explícitos tras cambio de octubre 2026'
]);

function esObjeto(x){
 return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
const CAMPOS=Object.freeze([
 'pgVersionNum','migrations','newRolesCount','newTablesCount',
 'newFunctionsCount','sessionCheckerOwner','sessionCheckerDefiner',
 'registrationEnabled','iaAutoEnabled','iaCronCount','publicBaselineMissingRls'
]);
export function evaluarInventarioDevD036(inv){
 const errores=[];
 if(!esObjeto(inv)||
   Object.keys(inv).length!==CAMPOS.length||
   Object.keys(inv).some(k=>!CAMPOS.includes(k)))
   errores.push('inventario_incompleto_o_con_campos_desconocidos');
 if(!errores.length){
   if(!Number.isSafeInteger(inv.pgVersionNum)||inv.pgVersionNum<170000)
     errores.push('postgres_17_requerido');
   if(!Array.isArray(inv.migrations)||
      inv.migrations.length!==HISTORIAL_DEV_VALIDADO_D036.length){
     errores.push('historial_migraciones_desconocido');
   } else {
     for(let i=0;i<HISTORIAL_DEV_VALIDADO_D036.length;i++){
       const received=inv.migrations[i], expected=HISTORIAL_DEV_VALIDADO_D036[i];
       if(!esObjeto(received)||Object.keys(received).length!==2||
         received.version!==expected.version||received.name!==expected.name){
         errores.push('migracion_no_coincide_'+String(i+1).padStart(2,'0'));
       }
     }
   }
   for(const key of ['newRolesCount','newTablesCount','newFunctionsCount',
     'iaCronCount','publicBaselineMissingRls']){
     if(!Number.isSafeInteger(inv[key])||inv[key]!==0)
       errores.push(key+'_inesperado');
   }
   if(inv.sessionCheckerOwner!=='postgres'||inv.sessionCheckerDefiner!==true)
     errores.push('session_checker_privilegios_incorrectos');
   if(inv.registrationEnabled!==false)
     errores.push('registro_dev_debe_estar_cerrado');
   if(inv.iaAutoEnabled!==false)
     errores.push('ia_auto_dev_debe_estar_apagada');
 }
 return Object.freeze({
   estado:errores.length?'BLOQUEADO':'BASELINE_DEV_CONSISTENTE',
   autorizaInstalacion:false,
   errores:Object.freeze(errores),
   puertasPendientes:PUERTAS_NO_VERIFICADAS_D036
 });
}
