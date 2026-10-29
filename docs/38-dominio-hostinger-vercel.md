# 38 — Dominio cotironda.com adquirido en Hostinger: integración preparada, NO publicada

**29/10/2026 · Propuesta técnica de dominio para la salida de Cotironda.**

## Dato del propietario
El dominio `cotironda.com` fue comprado en Hostinger. Se solicitó incorporar `www.cotironda.com` cuando convenga. **La compra del dominio no autoriza publicar ni modificar DNS inmediatamente**; la orden de producción de este proyecto es `Publicalo`.

## Auditoría read-only verificable de Vercel
Equipo Vercel `team_CE76WzHKVPy9e28LXIw2r3J4`:
- Proyecto público `cotironda` (ID `prj_gcJ44fDzmkHuZCdggE9jHrTG9zm8`): URL actual `https://cotironda.vercel.app`, solo demo. **Destino propuesto para el dominio público.**
- Proyecto `cotironda-portal-dev` (ID `prj_d13rTHxJADvP2K9PcrM0CJQD9Zok`): URL actual `https://cotironda-portal-dev.vercel.app`, desarrollo de Auth/portal. **No asignar `cotironda.com` ni `www` a este proyecto.**
- Lista de dominios asociada al proyecto `cotironda`: únicamente `cotironda.vercel.app`. Los dos nombres comprados siguen **sin agregar a Vercel**.

Consultas de configuración de DNS realizadas en modo solo lectura (no se modificó ningún registro):
- `cotironda.com`: NS `aurora.dns-parking.com` y `nebula.dns-parking.com` (Hostinger), A observada `2.57.91.91`.
- `www.cotironda.com`: CNAME observado `cotironda.com`, que actualmente conduce a Hostinger.
- Vercel informa `misconfigured=true` respecto de Vercel, **esperable** porque aún no conectamos el dominio. No significa que el dominio comprado esté roto.
- Referencias de DNS que devolvió la consulta de Vercel: A `76.76.21.21` para apex y CNAME `cname.vercel-dns.com.` para www. **Antes de editar Hostinger hay que agregar los dominios al proyecto, inspeccionar los records definitivos que Vercel solicite y usar esos**, ya que pueden requerirse valores personalizados o TXT de verificación.

## Diseño propuesto, aún sin publicación
1. `https://www.cotironda.com` → dirección pública canónica sugerida (por ser la dirección escrita por el propietario).
2. `https://cotironda.com` → redirección permanente a `www`, sin duplicar contenido para SEO.
3. Marketing/demo pública y portal de desarrollo **separados**. La decisión futura sobre cómo exponer login comercial (ruta `/ingresar` en el dominio canónico o subdominio `app`) se aprueba después de completar seguridad y modelo de negocio. No habilitar por anticipado Auth comercial.
4. En el futuro configurar `COTIRONDA_SITE_ORIGIN` con el **origen exacto** (sin slash) de la aplicación que implemente el POST de registro, y actualizar URL de redirección/autenticación en Supabase de **producción aislada** (NO reutilizar `cotironda-dev`).
5. Los tests `tests/unit/domains-cotironda.test.mjs` prueban origen exacto, CSRF antes de Auth, HTTPS y corte de Vercel Production para el portal de desarrollo.

## Procedimiento del día de publicación, sujeto a orden `Publicalo`
- [ ] Auditar rama, commit, proyecto Vercel, contenido de la demo, costos y destino exacto; proteger `main` y exigir CI.
- [ ] En Vercel → proyecto **`cotironda`** → Settings → Domains, agregar `www.cotironda.com` y `cotironda.com` y leer los valores específicos que el panel indique.
- [ ] En Hostinger → Domains → DNS, guardar una copia/snapshot de records actuales. **Modificar sólo A/AAAA y CNAME asociados a la web**; no tocar MX, SPF, DKIM, DMARC, NS, ni TXT ajenos. No transferir registrador ni cambiar nameservers globales.
- [ ] Si aparece desafío TXT de propiedad de Vercel, verificar control del dominio con valor exacto del proyecto, nunca inventarlo.
- [ ] Eliminar registros web conflictivos, configurar apex (A) y www (CNAME) según Vercel, revisar CDN activo de Hostinger para no dejar contenido cacheado antiguo.
- [ ] Confirmar estado `verified` del dominio en Vercel, certificado SSL HTTPS, redirección apex→www y navegación real en móvil/PC.
- [ ] Comprobar cookies, Auth redirect y CSRF cuando se publique el portal comercial en **otro despliegue autorizado**. No apuntar a portal-dev.
- [ ] Guardar evidencia del cambio, plan de reversión y reporte del commit publicado.

**Estado al cerrar esta auditoría:** no se cambió Hostinger, DNS, Vercel, GitHub main ni Supabase. No hay sitio público en `cotironda.com` creado por nuestro trabajo.

## Fuentes operativas
- [Hostinger — DNS Zone Editor](https://www.hostinger.com/support/how-to-use-hostingers-dns-zone-editor/)
- [Vercel — Custom domains](https://vercel.com/docs/domains/set-up-custom-domain)
- [Issue #49](https://github.com/ProtectorRudo/Cotironda/issues/49)
