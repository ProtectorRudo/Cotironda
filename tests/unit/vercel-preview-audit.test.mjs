import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verificarBuildPreviewPortal,
  COTIRONDA_VERCEL_PORTAL_DEV_PROJECT_ID,
  COTIRONDA_VERCEL_DEMO_PROJECT_ID
} from '../../src/server/vercel-preview-audit.ts';

const sha='31a8bd22fb501934398a4bdb5e133e01eb2acd73';
const events=[
  'Running build in Washington, D.C.',
  'Cloning github.com/ProtectorRudo/Cotironda (Branch: audit/01-vercel-correct-portal-preview)',
  'Detected Next.js version: 16.4.3',
  'Running "npm run build"',
  '> cotironda-portal@0.0.0 build',
  '> next build',
  '✓ Compiled successfully in 8.7s',
  'Route (app)',
  '┌ ○ /',
  '├ ƒ /alta',
  '├ ƒ /api/organizaciones',
  '└ ○ /ingresar',
  'ƒ Proxy (Middleware)',
  'Build Completed in /vercel/output [12s]'
];
const snapshot=()=>({
  deployment:{
    id:'dpl_CI_synthetic',
    state:'READY',
    target:null,
    project:{id:COTIRONDA_VERCEL_PORTAL_DEV_PROJECT_ID,name:'cotironda-portal-dev',framework:'nextjs'},
    meta:{githubCommitRef:'audit/01-vercel-correct-portal-preview',githubCommitSha:sha}
  },
  protection:{ssoEnabled:true,deploymentType:'all'},
  expectedSha:sha,
  buildEvents:[...events]
});

test('preview real Next de portal-dev con SSO, rutas y commit exacto se acepta',()=>{
  assert.doesNotThrow(()=>verificarBuildPreviewPortal(snapshot()));
});

test('demo marketing con READY y framework nulo NUNCA se confunde con portal',()=>{
  const x=snapshot();
  x.deployment.project={id:COTIRONDA_VERCEL_DEMO_PROJECT_ID,name:'cotironda',framework:null};
  x.buildEvents=['Build Completed in /vercel/output [46ms]'];
  assert.throws(()=>verificarBuildPreviewPortal(x),/preview_proyecto_equivocado/);
});

test('READY en production de portal-dev no habilita el check de Preview',()=>{
  const x=snapshot();
  x.deployment.target='production';
  assert.throws(()=>verificarBuildPreviewPortal(x),/preview_estado_o_destino_incorrecto/);
});

test('commit sin verificar o ref main no es una rama aislada',()=>{
  const x=snapshot();
  x.expectedSha='0000000000000000000000000000000000000000';
  assert.throws(()=>verificarBuildPreviewPortal(x),/preview_revision_no_auditada/);
  const y=snapshot();
  y.deployment.meta.githubCommitRef='main';
  assert.throws(()=>verificarBuildPreviewPortal(y),/preview_revision_no_auditada/);
});

test('una Preview sin protección SSO debe rechazarse',()=>{
  const x=snapshot();
  x.protection.ssoEnabled=false;
  assert.throws(()=>verificarBuildPreviewPortal(x),/preview_no_protegido/);
});

test('no aceptar build vacío de 46ms que no ejecutó Next',()=>{
  const x=snapshot();
  x.buildEvents=['Running "vercel build"','Build Completed in /vercel/output [46ms]'];
  assert.throws(()=>verificarBuildPreviewPortal(x),/preview_sin_next_detectado/);
});

test('faltas de rutas de API, /alta o Proxy rechazan una compilación incompleta',()=>{
  const samples=['ƒ /alta','ƒ /api/organizaciones','ƒ Proxy (Middleware)'];
  for(const missing of samples){
    const x=snapshot();x.buildEvents=events.filter(line=>!line.includes(missing));
    assert.throws(()=>verificarBuildPreviewPortal(x),/preview_sin_ruta_(?:api|alta)|preview_sin_proxy/);
  }
});

test('si el compilador Next falla no alcanza con las rutas impresas',()=>{
  const x=snapshot();
  x.buildEvents=events.filter(line=>!line.includes('Compiled successfully'));
  assert.throws(()=>verificarBuildPreviewPortal(x),/preview_no_compilo/);
});
