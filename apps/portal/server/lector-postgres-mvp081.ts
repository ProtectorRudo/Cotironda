/**
 * MVP-081 / Next.js servidor: adaptador PostgreSQL de SOLO LECTURA.
 * No se exporta en ruta HTTP ni en componente client; sin secreto la
 * conexion no se abre. NO usar desde una cuenta buyer sin verificarla
 * contra la sesion activa y la pertenencia al pedido en backend.
 */
import postgres from 'postgres';
import {validarEntornoLectorMvp081} from '../../../src/server/lector-pg-config-mvp081.ts';
import {
 construirPlantillasDesdePilotoMvp080,
 SQL_FUENTE_PRIVADA_MVP080,
 type ContextoLecturaMvp080
} from '../../../src/server/plantillas-piloto-mvp080.ts';

/** Solo para entorno de desarrollo aislado, activacion explicita. */
export async function leerPlantillasPrivadasMvp081(
 contextoAutorizado:ContextoLecturaMvp080
){
 const connectionString=validarEntornoLectorMvp081({
  habilitado:process.env.COTIRONDA_PILOT_READER_ENABLED,
  conexion:process.env.COTIRONDA_PILOT_READER_DATABASE_URL,
  modo:process.env.NODE_ENV,
  vercelEntorno:process.env.VERCEL_ENV,
  identificadorProyecto:process.env.COTIRONDA_PILOT_READER_PROJECT_ID
 });
 const connection=postgres(connectionString,{
  ssl:'require',
  max:1,
  idle_timeout:3,
  connect_timeout:5,
  max_lifetime:30,
  prepare:false
 });
 try{
  return await connection.begin(async transaction=>{
   await transaction.unsafe('set transaction read only');
   return construirPlantillasDesdePilotoMvp080({
    async query(sql,values){
     if(sql!==SQL_FUENTE_PRIVADA_MVP080||values.length!==2)
      throw new Error('mvp081_sql_no_autorizado');
     // SQL fijo de MVP080 y todos los IDs son parametros.
     // No loguear las filas: contienen el presupuesto original.
     const rows=await transaction.unsafe(sql,[...values]);
     return [...rows];
    }
   },contextoAutorizado);
  });
 }finally{
  await connection.end({timeout:2});
 }
}
