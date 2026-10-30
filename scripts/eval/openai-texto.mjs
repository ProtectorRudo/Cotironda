/**
 * Evaluador de IA REAL, pero BLOQUEADO por defecto.
 * Con credenciales autorizadas en entorno DEV privado:
 * COTIRONDA_IA_LIVE_EVAL=AUTORIZADO_DEV OPENAI_API_KEY=(secret)
 * node --experimental-strip-types scripts/eval/openai-texto.mjs --live
 *
 * Solo 3 casos sintéticos y máximo 3500 tokens de salida por caso.
 * NUNCA se ejecuta desde GitHub Actions ni desde CI predeterminada.
 */
import {readFileSync} from 'node:fs';
import {extraerMaterialesConIA} from '../../src/server/openai-extraccion.ts';

if(process.argv[2]!=='--live'){
  console.log('MODO OFFLINE: no se llamó a OpenAI. Usá la prueba unitaria con mocks.');
  process.exit(0);
}
if(process.env.COTIRONDA_IA_LIVE_EVAL!=='AUTORIZADO_DEV'||
  process.env.GITHUB_ACTIONS==='true'||
  !process.env.OPENAI_API_KEY){
  console.error('EVALUACION BLOQUEADA: requiere autorización explícita y clave privada DEV.');
  process.exit(2);
}
const corpus=JSON.parse(readFileSync(
  new URL('../../tests/fixtures/materiales-argentinos-ia-v1.json',import.meta.url),'utf8'));
const resultados=[];
for(const ejemplo of corpus.cases.slice(0,3)){
  try{
    const r=await extraerMaterialesConIA({
      texto:ejemplo.texto,apiKey:process.env.OPENAI_API_KEY,
      habilitarLlamadaExterna:true
    });
    const cantidades=r.borrador.lineas.map(x=>x.cantidad);
    resultados.push({
      id:ejemplo.id,elementos_esperados:ejemplo.esperados.length,
      elementos_extraidos:r.borrador.lineas.length,
      cantidades_correctas:ejemplo.esperados.length===cantidades.length &&
        ejemplo.esperados.every((x,i)=>x.cantidad===cantidades[i]),
      referencias_no_cubiertas:r.lineas_sin_extraccion.length,
      lineas_con_advertencias:r.borrador.lineas.filter(x=>x.requiere_aclaracion.length).length,
      tokens:r.tokens
    });
  }catch(e){
    // Nunca imprimir errores crudos del proveedor, prompt, token ni documentos.
    resultados.push({id:ejemplo.id,estado:'fallo_controlado',
      codigo:e instanceof Error?e.message:'ia_error_no_clasificado'});
  }
}
console.log(JSON.stringify({modelo:'gpt-6-luna',corpus:corpus.version,
  casos_evaluados:resultados.length,resultado:resultados},null,2));
