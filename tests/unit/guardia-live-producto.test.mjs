import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {
  CASOS_LIVE,MODELO_EVAL,MAX_CASOS,
  PRECIO_USD_MTOK,RESERVA_POR_REQUEST_USD,PRESUPUESTO_SOFT_USD,
  validarGuardiaLive,estimarCosto,permitirSiguienteReserva
} from '../../scripts/eval/guardia-live-producto.mjs';

const fake='sk-falso_solo_laboratorio_123456789';
const valido={
  COTIRONDA_IA_LIVE_EVAL:'AUTORIZADO_DEV',
  COTIRONDA_IA_MAX_USD:'0.02',
  OPENAI_API_KEY:fake
};
test('ensayo LIVE bloqueado de forma predeterminada incluso con clave disponible',()=>{
  assert.deepEqual(validarGuardiaLive({argv:[],env:valido}),
    {habilitado:false,codigo:'live_requiere_optin'});
});
test('no se ejecuta si falta autorización explícita de costo',()=>{
  for(const env of [
    {...valido,COTIRONDA_IA_LIVE_EVAL:''},
    {...valido,COTIRONDA_IA_MAX_USD:''},
    {...valido,COTIRONDA_IA_MAX_USD:'1.00'},
    {...valido,COTIRONDA_IA_MAX_USD:'0.05'}
  ]){
    assert.equal(validarGuardiaLive({argv:['--live'],env}).habilitado,false);
  }
});
test('no se ejecuta con credencial faltante o formato inválido',()=>{
  for(const key of ['',undefined,'incorrecta','sk-corta']){
    const e={...valido,OPENAI_API_KEY:key};
    assert.equal(validarGuardiaLive({argv:['--live'],env:e}).codigo,
      'live_sin_clave_servidor');
  }
});
test('GitHub Actions, CI, Vercel y producción siempre bloquean incluso con flags',()=>{
  const casos=[
    {GITHUB_ACTIONS:'true'},
    {CI:'1'},
    {VERCEL_ENV:'preview'},
    {VERCEL_ENV:'development'},
    {VERCEL_ENV:'production'},
    {NODE_ENV:'production'}
  ];
  for(const patch of casos){
    const result=validarGuardiaLive({
      argv:['--live'],env:{...valido,...patch}
    });
    assert.equal(result.codigo,'live_solo_dev_local',JSON.stringify(patch));
  }
});
test('solo flags exactos, dev local y clave con forma válida permiten iniciar',()=>{
  assert.deepEqual(validarGuardiaLive({argv:['--live'],env:valido}),
    {habilitado:true,codigo:'live_autorizado'});
});
test('precio publicado Luna estándar, máximo 6 casos y sin ajuste libre de presupuesto',()=>{
  assert.equal(MODELO_EVAL,'gpt-6-luna');
  assert.deepEqual(CASOS_LIVE.length,MAX_CASOS);
  assert.equal(PRECIO_USD_MTOK.entrada,0.1);
  assert.equal(PRECIO_USD_MTOK.salida,0.5);
  assert.equal(PRESUPUESTO_SOFT_USD,0.02);
  assert.ok(MAX_CASOS*RESERVA_POR_REQUEST_USD<PRESUPUESTO_SOFT_USD);
});
test('estimador monetario determinista sin NaN/valores negativos',()=>{
  assert.equal(estimarCosto({entrada:10000,salida:3500}),0.00275);
  assert.equal(estimarCosto({entrada:1000,salida:500}),0.00035);
  for(const x of [null,-1,NaN,1.2,Infinity]){
    assert.throws(()=>estimarCosto({entrada:x,salida:500}),/uso_tokens_invalido/);
  }
});
test('reserva preventiva bloquea una solicitud adicional sobre presupuesto',()=>{
  assert.equal(permitirSiguienteReserva(0,6),true);
  assert.equal(permitirSiguienteReserva(0,7),true);
  assert.equal(permitirSiguienteReserva(0,8),false);
  assert.equal(permitirSiguienteReserva(0.019),false);
  assert.equal(permitirSiguienteReserva(NaN),false);
});
test('CLI sin --live devuelve bloqueo JSON sin conexiones',()=>{
  const raw=execFileSync(process.execPath,[
    'scripts/eval/producto-quality-live.mjs'
  ],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME},
     timeout:12000});
  const result=JSON.parse(raw);
  assert.equal(result.modo,'BLOQUEADO_sin_red');
  assert.equal(result.codigo,'live_requiere_optin');
  assert.equal(result.escenarios_maximos,6);
});
test('CLI --live en CI bloquea antes de cualquier request y no filtra secreto',()=>{
  const result=spawnSync(process.execPath,[
    'scripts/eval/producto-quality-live.mjs','--live'
  ],{encoding:'utf8',timeout:12000,
     env:{PATH:process.env.PATH,HOME:process.env.HOME,...valido,CI:'true'}});
  assert.equal(result.status,2);
  const output=JSON.parse(result.stdout);
  assert.equal(output.codigo,'live_solo_dev_local');
  assert.ok(!result.stdout.includes(fake));
  assert.ok(!result.stderr.includes(fake));
});
