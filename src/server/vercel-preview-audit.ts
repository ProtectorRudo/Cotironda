/**
 * Auditoría determinista de un deployment Vercel: READY no prueba Next.js.
 * El proyecto Cotironda de demo NO puede sustituir a cotironda-portal-dev.
 * Sin llamadas de red ni acceso a secrets; consumes metadata/sanitized build logs.
 */
export const COTIRONDA_VERCEL_PORTAL_DEV_PROJECT_ID='prj_d13rTHxJADvP2K9PcrM0CJQD9Zok';
export const COTIRONDA_VERCEL_DEMO_PROJECT_ID='prj_gcJ44fDzmkHuZCdggE9jHrTG9zm8';

export type VercelPreviewAuditInput = {
  deployment: {
    id:string;
    state:string;
    target:string|null;
    project:{id:string;name:string;framework:string|null};
    meta:{githubCommitRef:string;githubCommitSha:string};
  };
  protection:{ssoEnabled:boolean;deploymentType:string|null};
  expectedSha:string;
  buildEvents:readonly string[];
};

export function verificarBuildPreviewPortal(input:VercelPreviewAuditInput):void {
  if(input.deployment.project.id!==COTIRONDA_VERCEL_PORTAL_DEV_PROJECT_ID||
     input.deployment.project.name!=='cotironda-portal-dev') {
    throw new Error('preview_proyecto_equivocado');
  }
  if(input.deployment.project.framework!=='nextjs')throw new Error('preview_framework_incorrecto');
  if(input.deployment.state!=='READY'||input.deployment.target!==null) {
    throw new Error('preview_estado_o_destino_incorrecto');
  }
  if(!/^[a-f0-9]{40}$/i.test(input.expectedSha)||
     input.deployment.meta.githubCommitSha!==input.expectedSha||
     !/^(?:test|audit|security|feat)\//.test(input.deployment.meta.githubCommitRef)){
    throw new Error('preview_revision_no_auditada');
  }
  if(!input.protection.ssoEnabled||
     !['all','preview'].includes(input.protection.deploymentType??'')){
    throw new Error('preview_no_protegido');
  }
  const events=input.buildEvents.map(line=>line.trim()).join('\n');
  for(const [pattern,code] of [
    [/Detected Next\.js version:\s*16\./,'preview_sin_next_detectado'],
    [/(?:^|\n)>\s+next build(?:\s|\n|$)/,'preview_sin_build_next'],
    [/Compiled successfully/,'preview_no_compilo'],
    [/Route \(app\)/,'preview_sin_rutas'],
    [/ƒ\s+\/alta(?:\n|\s)/,'preview_sin_ruta_alta'],
    [/ƒ\s+\/api\/organizaciones(?:\n|\s)/,'preview_sin_ruta_api'],
    [/ƒ\s+Proxy \(Middleware\)/,'preview_sin_proxy'],
    [/Build Completed in \/vercel\/output/,'preview_build_incompleto']
  ] as const){
    if(!pattern.test(events))throw new Error(code);
  }
}
