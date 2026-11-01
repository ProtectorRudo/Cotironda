/**
 * Validador de inventario pg_restore --list (solo metadatos).
 * No acepta reemplazar un respaldo completo por un dump solo de schema/public.
 * No realiza operaciones de red, no lee bytes de tablas ni secretos.
 */
export const REQUIRED_BACKUP_TOC = [
  'TABLE public organizations',
  'TABLE public organization_members',
  'TABLE public catalog_categories',
  'TABLE public supplier_profiles',
  'TABLE public supplier_categories',
  'TABLE public supplier_products',
  'TABLE public supplier_delivery_areas',
  'TABLE cotironda_private registration_settings',
  'TABLE cotironda_private supplier_contacts',
  'TABLE cotironda_private document_intake_jobs',
  'TABLE auth users',
  'TABLE auth sessions',
  'TABLE storage buckets',
  'TABLE storage objects',
  'TABLE DATA public catalog_categories',
  'TABLE DATA cotironda_private registration_settings',
  'TABLE DATA auth users',
  'TABLE DATA auth sessions',
  'TABLE DATA storage buckets',
  'TABLE DATA storage objects',
  'FUNCTION cotironda_private storage_session_active',
  'POLICY public catalog_categories categories_read_active'
] as const;

function normalizarObjetoToc(linea:string):string|null {
  // pg_restore -l: "1234; 1259 54321 TABLE public organizations postgres"
  // Ignorar comentarios y falsos marcadores fuera de una entrada TOC real.
  const match=/^\s*\d+;\s+\d+\s+\d+\s+(TABLE DATA|TABLE|FUNCTION|POLICY)\s+(\S+)\s+(\S+)(?:\s+(\S+))?\s/.exec(linea+' ');
  if(!match)return null;
  const [,clase,schema,nombre,extra]=match;
  if(clase==='FUNCTION')return [clase,schema,nombre.replace(/\(.*$/,'')].join(' ');
  return [clase,schema,nombre,...(clase==='POLICY'?[extra??'']:[])].join(' ');
}

/** Falla ante dumps parciales, vacíos, comentarios suplantados o sin datos. */
export function validarInventarioRespaldo(inventario:string):void {
  if(typeof inventario!=='string'||inventario.length<100)throw new Error('backup_toc_invalido');
  const objetos=new Set(inventario.split(/\r?\n/).map(normalizarObjetoToc).filter(Boolean));
  for(const obligatorio of REQUIRED_BACKUP_TOC){
    if(!objetos.has(obligatorio))throw new Error('backup_toc_falta_'+obligatorio.replace(/\s+/g,'_'));
  }
}
