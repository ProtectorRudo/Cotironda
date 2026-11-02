# MVP-083 — Conectar cotironda.com sin publicar un piloto incompleto

**Fecha:** 02/11/2026 · Issue #380 · Proyecto `ProtectorRudo/Cotironda`.
**Estado:** dominio dado de alta en Vercel, cambio DNS PENDIENTE; NO publicar nueva versión ni activar mensajes.

## Comprobación real de infraestructura

- Vercel correcto (GitHub integrado): **proyecto `cotironda`**, id `prj_gcJ44fDzmkHuZCdggE9jHrTG9zm8`, repositorio `ProtectorRudo/Cotironda`. La producción actual fue desplegada desde `main` commit `5987f1705ff1dba609489374531fa9e942150e7a` y corresponde a una **demostración anterior**, NO al piloto WhatsApp completo. Vercel informa `framework: null`; no asumir que Next.js portal está servido desde la raíz.
- Proyecto paralelo de prueba **`cotironda-portal-dev`**, id `prj_d13rTHxJADvP2K9PcrM0CJQD9Zok`: sin integración Git según comprobación de Vercel. No asociarle el dominio comercial; está protegido por SSO.
- Vercel **ya asoció y verificó la titularidad** de `cotironda.com` y `www.cotironda.com` al proyecto correcto. `www` tiene redirección permanente HTTP **308** hacia `cotironda.com`.
- Vercel informa **`misconfigured=true`** para AMBOS dominios a nivel DNS. El dominio sigue administrado por Hostinger: NS `aurora.dns-parking.com` y `nebula.dns-parking.com`. El apex usa A `2.57.91.91` y `www` CNAME `cotironda.com.`.
- Valores recomendados actuales por Vercel (verificados en API del proyecto): **apex `@` A `76.76.21.21`** y **`www` CNAME `cname.vercel-dns.com.`**. **Reconsultar la API en el momento del corte** porque Vercel puede recomendar valores específicos de proyecto.
- NO se cambió la zona DNS de Hostinger, no se transfirieron nameservers y no se emitió/validó aún el certificado TLS del dominio propio.

## Paso pendiente en Hostinger (solo después de autorizar la salida)

En [Hostinger hPanel](https://hpanel.hostinger.com/): **Dominios → Portfolio de dominios → Administrar cotironda.com → DNS / Nameservers → Registros DNS**.

1. Hacer copia/exportar los registros actuales y comprobar si hay servicios de correo/validación (MX/TXT/SPF/DKIM/DMARC), NO editarlos.
2. Sustituir SOLO el **A `@`** que apunta a `2.57.91.91` por la IP A exacta confirmada de Vercel (ahora `76.76.21.21`). Eliminar únicamente entradas A/AAAA de apex incompatibles, nunca MX/TXT.
3. Sustituir el **CNAME `www`** actual (`cotironda.com.`) por el destino exacto que confirme Vercel (ahora `cname.vercel-dns.com.`). Nunca crear CNAME sobre apex.
4. Mantener NS en Hostinger. No hace falta cambiar la propiedad del dominio.
5. Tras propagación, verificar en Vercel `configuredBy` / `misconfigured=false` para ambos, HTTPS/SSL válido, HTTP 308 desde `www`, contenido correcto de la versión aprobada y funcionamiento de login/consentimiento; probar móvil y PC.

## Puerta de publicación obligatoria

**No ejecutar DNS cutover solo porque Vercel muestra `verified=true`.** La asociación es distinta de tener DNS configurado y de servir una aplicación lista. Con la versión demo actual el dominio podría mostrar contenido desactualizado.

Criterios para `Publicalo`:

- Repositorio GitHub (fuente de verdad) con rama / commit de release explícitos, sin PRs inestables, AGENTS/README/CHANGELOG actualizados y 5/5 CI PASS.
- Proyecto Vercel con `framework=nextjs` y raíz `apps/portal` **solo si** el commit de release efectivamente contiene el portal y sus dependencias; probar esa configuración en un Preview aislado ANTES de modificar la producción actual.
- Oferta original sin cambios y plantilla anónima completa, con todos los cargos, extras, descuentos, IVA, entrega y total literal. Sin filtrar identificación del proveedor, sin rankings engañosos.
- End-to-end WhatsApp compra/proveedor, autenticación y autorización por cliente, revisión privada contra versiones y hash; clave PostgreSQL en administrador de secretos, no en GitHub, chat ni navegador. Outbound controlado y expresamente habilitado solo tras probarlo.
- SSL y dominio propios verificados, `www → apex`, rollback preparado para restaurar A/CNAME anteriores.
- Aprobación explícita de versión y entorno antes de promover/build de producción. Si se desea publicar primero solo **portada corporativa**, tratarla como release pública independiente, sin habilitar datos ni módulos del piloto.

**No se ejecutó ningún deploy nuevo ni se solicitó un corte DNS.** Este documento registra trabajo de configuración real en Vercel y un procedimiento reproducible.

Fuentes: documentación oficial [Vercel dominios](https://vercel.com/docs/domains/set-up-custom-domain) y [Hostinger DNS](https://support.hostinger.com/en/articles/1583249-how-to-manage-dns-records-at-hostinger).
