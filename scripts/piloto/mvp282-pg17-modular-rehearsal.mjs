// MVP282: cobertura cruzada y ejecución de tests PG17 transaccionales existentes.
// Los 11 fixtures prueban los 21 archivos, pero NO forman un único schema acumulativo.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {migrationFiles} from './mvp281-manifiesto-integracion.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
export const cases=Object.freeze([
  'mvp227-cotizaciones-por-rubro-pg17.sql', // 245
  'mvp250-marcas-materiales-sin-pii.sql', // 248,250
  'mvp253-visual-ocr-permission-pg17.sql', // 253
  'mvp256-document-retry-pg17.sql', // 256
  'mvp257-whapi-uncertain-pg17.sql', // 257
  'mvp258-uncertain-noid-pg17.sql', // 258
  'mvp260-memory-broker-pg17.sql', // 259,260
  'mvp261-commercial-version-chain-pg17.sql', // 261
  'mvp267-operator-supabase-auth-pg17.sql', // 262-267
  'mvp274-continuous-pilot-pg17.sql', // 274 y rollback manual solo sintetico
  'mvp280-all-buyer-sources-pg17.sql' // 276-280
]);

export function inspectFixtures(testNames=cases,readFile=(p)=>fs.readFileSync(p,'utf8'),repoRoot=root) {
  const errors=[],seen=new Set(),coverage=new Map(), importsByTest={};
  for(const name of testNames) {
    if(!/^mvp[0-9]{3}-[a-z0-9-]+\.sql$/.test(name)) {
      errors.push('Fixture inesperado: '+name);continue;
    }
    if(seen.has(name)) errors.push('Fixture duplicado: '+name);
    seen.add(name);
    const p=path.join(repoRoot,'supabase/tests/ci',name);
    let sql;
    try{sql=readFile(p);}catch{errors.push('Fixture ausente: '+name);continue;}
    if(!/^BEGIN;\s*$/im.test(sql) || !/^ROLLBACK;\s*$/im.test(sql)) {
      errors.push('Fixture sin BEGIN/ROLLBACK: '+name);
    }
    if(/\\!|\\copy\s|\b(?:dblink_connect|http_post|net\.http_post)\s*\(/i.test(sql)) {
      errors.push('Fixture tiene posible salida externa: '+name);
    }
    const imports=[...sql.matchAll(/^\\ir\s+\.\.\/\.\.\/piloto\/([a-z0-9_]+\.sql)\s*$/gm)].map(m=>m[1]);
    importsByTest[name]=imports;
    for(const imported of imports) {
      if(migrationFiles.includes(imported)){
        if(!coverage.has(imported)) coverage.set(imported,[]);
        coverage.get(imported).push(name);
      }
    }
  }
  const missing=migrationFiles.filter(m=>!coverage.has(m));
  if(missing.length)errors.push('Migraciones no ensayadas: '+missing.join(', '));
  return {valid:errors.length===0,fixtureCount:testNames.length,migrationsCovered:coverage.size,
    migrationTotal:migrationFiles.length,missing,errors,importsByTest};
}

function pg(commandArgs){
  const x=spawnSync('psql',['-X','-v','ON_ERROR_STOP=1',...commandArgs],{
    cwd:root,env:{...process.env,PGOPTIONS:'-c statement_timeout=90000'},
    encoding:'utf8',maxBuffer:8_000_000,timeout:120_000
  });
  if(x.error || x.status!==0){
    throw Error('psql fixture falló (sin imprimir datos): '+String(x.error?.message||x.stderr?.slice(-1300)||x.status));
  }
  return x.stdout.trim();
}

export function validateIsolation(env=process.env){
  if(!['localhost','127.0.0.1'].includes(env.PGHOST)||env.PGPORT!=='5432'||
     env.PGDATABASE!=='cotironda_ci'||env.PGUSER!=='postgres') {
    throw Error('MVP282: SOLO PostgreSQL 17 de CI en localhost/cotironda_ci');
  }
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const option=process.argv[2]||'--check';
  if(!['--check','--run'].includes(option)||process.argv.length>3){
    process.stderr.write('Uso: node scripts/piloto/mvp282-pg17-modular-rehearsal.mjs [--check|--run]\n');
    process.exitCode=2;
  }else{
    const inspection=inspectFixtures();
    if(!inspection.valid){
      process.stderr.write(JSON.stringify(inspection.errors)+'\n');
      process.exitCode=1;
    }else if(option==='--check'){
      process.stdout.write(JSON.stringify({
        status:'modular_fixture_coverage_ok',tested_modules:inspection.migrationsCovered,
        fixture_count:inspection.fixtureCount,coinstall_same_schema_verified:false
      })+'\n');
    }else{
      try{
        validateIsolation();
        if(!/17\.[0-9]+/.test(pg(['-A','-t','-c','SHOW server_version;']))) {
          throw Error('Solo PostgreSQL 17');
        }
        for(const name of cases){
          const started=Date.now();
          pg(['-q','-f','supabase/tests/ci/'+name]);
          const leftovers=pg(['-A','-t','-c',`SELECT (to_regnamespace('cotironda_piloto_privado') IS NULL AND to_regnamespace('auth') IS NULL AND to_regnamespace('storage') IS NULL)::text;`]);
          if(leftovers!=='true' && leftovers!=='t'){
            throw Error('Persistieron objetos después de ROLLBACK: '+name);
          }
          process.stdout.write(JSON.stringify({fixture:name,status:'passed_rolled_back',elapsed_ms:Date.now()-started})+'\n');
        }
        process.stdout.write(JSON.stringify({
          status:'all_modular_fixtures_passed',fixtures:cases.length,
          migration_files_covered:migrationFiles.length,
          all_21_coinstalled_in_one_schema:false,
          synthetic_only:true,deploy_authorized:false
        })+'\n');
      }catch(e){process.stderr.write(String(e)+'\n');process.exitCode=1;}
    }
  }
}
