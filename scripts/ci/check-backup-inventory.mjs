import {readFileSync} from 'node:fs';
import {validarInventarioRespaldo} from '../../src/server/backup-restore-integrity.ts';

if(process.env.GITHUB_ACTIONS!=='true'||
   process.env.COTIRONDA_CI_BACKUP_RESTORE!=='true'||
   process.argv.length!==3){
 throw new Error('inventario_ci_no_autorizado');
}
try{
 validarInventarioRespaldo(readFileSync(process.argv[2],'utf8'));
 console.log('PASS: inventario dump completo (public, privado, Auth, Storage, data y RLS)');
}catch{
 console.error('FAIL: inventario incompleto; restauración prohibida');
 process.exitCode=1;
}
