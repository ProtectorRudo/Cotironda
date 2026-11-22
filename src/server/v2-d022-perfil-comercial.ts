/** D022 - vista de perfil de comercio, nunca devuelve campos de Storage. */
export type PerfilComercialD022=Readonly<{
 estado:'perfil_comercial_autorizado';comercio:string;rubro:string|null;
 direccion:string|null;localidad:string|null;fotoDisponible:boolean;
 whatsappUrl:string|null;mapsUrl:string|null;
}>;
const PHONE=/^\+[1-9][0-9]{6,14}$/u;
const CONTROL=/[<>\u0000-\u001f\u007f]/u;
const TEXT="Hola, vi su presupuesto en Cotironda y quisiera consultarles por los materiales cotizados. ¡Gracias!";
function object(v:unknown):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v);
}
function field(value:unknown,max:number):string|null{
 return typeof value==='string'&&value.trim()===value&&
 value.length>=2&&value.length<=max&&!CONTROL.test(value)?value:null;
}
export function proyectarPerfilComercialD022(raw:unknown):PerfilComercialD022|null{
 if(!object(raw)||raw.state!=='supplier_profile_authorized_v2')return null;
 const comercio=field(raw.comercio,100);
 if(!comercio)return null;
 const rubro=field(raw.rubro,90),direccion=field(raw.direccion,190);
 const localidad=field(raw.localidad,90),pais=field(raw.pais,70);
 const telefono=typeof raw.whatsapp==='string'&&PHONE.test(raw.whatsapp)?
  raw.whatsapp:null;
 const fotoDisponible=typeof raw.fotoPath==='string'&&
  /^proveedores\/[a-z0-9_-]{3,100}\/[a-f0-9]{64}\.(?:jpg|png|webp)$/u.test(raw.fotoPath)&&
  typeof raw.supplierKey==='string'&&
  raw.fotoPath.startsWith('proveedores/'+raw.supplierKey+'/');
 const whatsappUrl=telefono?
  'https://wa.me/'+telefono.slice(1)+'?text='+encodeURIComponent(TEXT):null;
 const ubicacion=[direccion,localidad,pais].filter(Boolean).join(', ');
 const mapsUrl=direccion?
  'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(ubicacion):null;
 return Object.freeze({
  estado:'perfil_comercial_autorizado' as const,comercio,rubro,
  direccion,localidad,fotoDisponible,whatsappUrl,mapsUrl
 });
}
