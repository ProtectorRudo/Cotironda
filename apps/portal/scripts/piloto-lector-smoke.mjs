/**
 * MVP082: prueba OPERADOR, ejecutada en terminal privada aislada.
 * Solo devuelve totales. No crea endpoints ni comparte presupuestos.
 * Requiere conexión dedicada en entorno de desarrollo, sin secretos en Git.
 */
import {leerPlantillasPrivadasMvp081} from '../server/lector-postgres-mvp081.ts';

if(process.env.COTIRONDA_PILOT_READER_OPERATOR_APPROVED!=='true'){
 console.error('mvp082_operador_no_autorizado');process.exit(2);
}
try{
 const response=await leerPlantillasPrivadasMvp081({
  solicitudId:process.env.COTIRONDA_PILOT_READER_REQUEST_ID??'',
  compradorAutenticado:'arquitecto',
  revisionesPrivacidad:[]
 });
 const n=response.ofertas.length;
 const held=response.ofertas.filter(x=>x.estado==='retenida_por_verificacion').length;
 if(n===0||n!==held||!response.ofertas.every(x=>
  x.renglones.length===0&&x.totalLiteral===null)){
  throw new Error('mvp082_prueba_no_privada');
 }
 // Unicamente métricas; ninguna linea, UUID, token, SHA, telefono o precio.
 process.stdout.write(JSON.stringify({estado:'reader_piloto_hold_only',
  versiones:n,retenidas:held,no_hay_exposicion:true})+'\n');
}catch{
 console.error('mvp082_smoke_sin_completar');
 process.exitCode=1;
}
