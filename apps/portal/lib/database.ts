import 'server-only';
import { Pool } from 'pg';
import type { AltaEmpresaPort, AltaPersistible } from '../../../src/domain/onboarding.ts';
import { portalHabilitado } from '../../../src/server/portal-entorno.ts';

let pool: Pool | undefined;
function db(): Pool {
  const connectionString=process.env.COTIRONDA_DATABASE_URL;
  if(!connectionString || !portalHabilitado(process.env)) throw new Error('db_no_configurada');
  if(!pool) pool=new Pool({
    connectionString, max:3, connectionTimeoutMillis:5000, idleTimeoutMillis:15000,
    query_timeout:7000, statement_timeout:6000, ssl:{rejectUnauthorized:true}
  });
  return pool;
}

export function puertoRegistroPostgres(): AltaEmpresaPort {
  return {
    async crearEmpresaConPropietario(input:AltaPersistible) {
      try {
        const sql = `select organization_id as "organizationId", replay
          from cotironda_private.register_company($1::uuid, $2::uuid, $3::text, $4::text, $5::text)`;
        const result=await db().query<{organizationId:string;replay:boolean}>(sql,[
          input.userId,input.idempotencyKey,input.nombre,input.tipo,input.nombreComercial
        ]);
        if(result.rowCount!==1) throw Error('db_resultado_invalido');
        return result.rows[0];
      } catch (e) {
        if (e instanceof Error && 'code' in e && e.code === '23505') throw Error('request_id_conflictivo');
        if (e instanceof Error && e.message.includes('limite_registros')) throw Error('limite_registros');
        throw Error('db_no_disponible'); // Nunca incluir consultas ni secretos en respuestas HTTP.
      }
    }
  };
}
