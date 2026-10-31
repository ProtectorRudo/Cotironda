/**
 * Rebuild the byte-identical, self-contained Edge snapshot from trusted
 * repository sources before any future development deployment.
 * Never reads environment variables, database or API credentials.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

const sourceFiles=[
  'src/domain/catalogo.ts',
  'src/domain/despacho-automatico.ts',
  'src/domain/extraccion-documental.ts',
  'src/domain/identidad-producto.ts',
  'src/domain/invitaciones-por-producto.ts',
  'src/domain/taxonomia-materiales.ts',
  'src/domain/evaluacion-invitaciones-producto.ts',
  'src/server/openai-extraccion.ts',
  'src/server/flujo-calidad-ia.ts',
  'tests/fixtures/gold-invitaciones-producto-v1.mjs'
];
for(const file of sourceFiles){
  const relative=file.startsWith('src/')?
    file.slice(4):file.replace(/^tests\//,'');
  const target='supabase/functions/cotironda-ia-dev/core/'+relative;
  mkdirSync(dirname(target),{recursive:true});
  writeFileSync(target,readFileSync(file));
  console.log('snapshot '+relative);
}
console.log('Todos los archivos copiados byte a byte. Ejecutar npm run test:unit y revisar diff.');
