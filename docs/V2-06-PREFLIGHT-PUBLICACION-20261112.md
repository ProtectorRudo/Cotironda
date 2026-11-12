# Cotironda V2-06 — Preflight bloqueante de publicación del piloto (12/11/2026)

**Estado:** desarrollo y auditoría SOLO LECTURA. **No instalé SQL/Edge, no creé Auth ni consentimientos, no configuré secretos, no desplegué Vercel ni envié WhatsApps.** Fuente técnica: [PR #827](https://github.com/ProtectorRudo/Cotironda/pull/827), apilado sobre #826 → #816. Contrato de negocio: PR #815.

## Resultado real (verificado con conectores, sin editar)

| Elemento | Evidencia 12/11/2026 | Consecuencia |
|---|---|---|
| Supabase PILOTO | `ilggkalaafhtiysyzlmg`, PostgreSQL 17.11 | Operativo para pruebas; NO implica V2 publicada |
| Compradores con sesión Auth | `auth.users=0` | Ningún arquitecto puede abrir todavía el portal privado |
| Bucket originales | `cotironda-piloto-originals`, privado y 8 MiB | Disponible |
| Funciones comerciales V2-02/03/04 | 0 instaladas, según consulta nueva SQL | No hay listado/descarga/análisis privado real |
| Tabla de consentimiento/guía y calendario | 0 tablas V2 nuevas | No hay consentimiento prospectivo documentado ni guía persistida |
| Rondas antiguas | 2 restricciones `requests_round_days_check`/`requests_exact_duration_check` | V2-05 exige migración compatible; **preservar el comportamiento histórico**, no quitar protección |
| Edge actual Whapi | `cotironda-piloto-whapi` **v76**, hash `656cb24bd1cbfdbb0de6d87a9acae17ad911c13b6e404667029dd4d0b55b822e` | No sobrescribir por código histórico; revalidar antes de un deploy |
| Edge lector privado PDF | No instalado | PR #826 solo probado en CI |
| Vercel | `cotironda-portal-dev`, framework Next.js, preview SSO protegida | Existe proyecto, pero NO son rutas V2 publicadas |
| Variables Preview Vercel | Solo 5 nombres: `COTIRONDA_AUTH_PREVIEW_ENABLED`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `COTIRONDA_SUPABASE_PROJECT_REF`, `COTIRONDA_REGISTRATION_ENABLED` | Falta configuración **privada** exigida por el nuevo circuito y pin SHA de build |
| Asociación documental real | No se comprobó un vínculo fuerte de una oferta de proveedor V2 y la ronda del comprador | No atribuir los PDF/Excel históricos por similitud de nombre, fecha o semántica |

**Atención:** una CI verde certifica el código ensayado y el rollback PG17, **NO** acredita que el comprador pueda descargar hoy sus cotizaciones. No se utilizaron ni publicaron datos personales ni claves.

## Nuevo control ejecutable

- `supabase/piloto/v2_06_release_inventory_readonly.sql`: un solo `SELECT` con catálogo de RPC/tabla, cantidad de usuarios Auth y metadatos Storage. Funciona aunque las tablas V2 todavía no existan. No lee teléfonos, documentos, UUID de personas ni secretos.
- `scripts/piloto/observaciones/v2-readiness-piloto-20261112.json`: **fotografía NO sensible**, observada hoy con Supabase/Vercel/Edge; no se considera vigente eternamente.
- `scripts/piloto/v2-release-readiness.mjs`: inspecciona un archivo JSON de observación ya obtenido. Comprueba dos fases distintas: `primer_original` y `piloto_completo`. La primera requiere comprador Auth, consentimiento explícito V2, archivo asociado con prueba fuerte, RPC/tabla privada instaladas, lector PDF, Vercel Preview SHA exacto y prueba browser sin fuga de datos. La segunda agrega ruteo D013 por producto, 2 días hábiles, cierre automatizado, dos proveedores verdaderos y análisis final probado.
- `tests/unit/v2-06-preflight-publicacion.test.mjs`: pruebas negativas y positivas sintéticas, incluidas discrepancias de Whapi v76, SHA de Vercel, consentimiento ausente y datos históricos ambiguos. La CI verifica que la fotografía real **termine BLOQUEADA**: no puede desaparecer una condición sin evidencia.

**Este control NO tiene herramientas de escritura ni despliega nada.** Si todo estuviera comprobado devuelve `PREFLIGHT_PASS_REQUIRES_PUBLICALO`, pero `can_publish` siempre permanece `false`, incluso con datos sintéticos positivos. El archivo JSON se puede falsear manualmente; por eso su resultado NO sustituye verificar en vivo cada fuente ni autorización expresa.

Ejecución sin secretos:

```bash
node scripts/piloto/v2-release-readiness.mjs scripts/piloto/observaciones/v2-readiness-piloto-20261112.json primer_original
node scripts/piloto/v2-release-readiness.mjs scripts/piloto/observaciones/v2-readiness-piloto-20261112.json piloto_completo
```

El exit code es `2` cuando hay bloqueos; **es el resultado correcto para el estado actual**.

## Secuencia de publicación PILOTO, a ejecutar solamente con «Publicalo»

1. **Congelar y revalidar código**: cada PR #816–#826 en orden y SHA, CI final del conjunto, diff firmado; conservar la lógica activa Whapi v76 y sus 61 archivos, verificar SHA en vivo antes de tocar Edge. No merge en producción por accidente.
2. **Revisar backup, rollback y un entorno de pruebas aislado.** Ensayar las migraciones V2-02 → V2-03a → V2-03b → V2-04b → D013 → V2-05 en orden de dependencias y pruebas PG17, revalidar firma exacta de las funciones SQL. El orden real de D013/V2-05 sobre la función shadow requiere ejecutar exactamente los archivos candidatos probados; nunca soltar los checks históricos a ciegas.
3. **Preparar seguridad e identidades**: alta autenticada del arquitecto en Auth PILOTO con confirmación telefónica real; consentimiento prospectivo de cada proveedor para exhibir su nombre y originales al comprador (no convertir el viejo opt-in de WhatsApp en autorización implícita). Registrar prueba de autorización sin copiar teléfonos al repositorio.
4. **Instalar servicios sin activarlos**: RPCs y tablas privadas/Storage, nueva Edge PDF aislada y Vercel Preview correcto; comprobar nombres de variables y secreto PDF con controles del proveedor, sin mostrar valores a personas ni en GitHub. Preservar el proyecto Vercel original de producción.
5. **Asegurar release**: URL privada de Preview, `VERCEL_ENV=preview`, `COTIRONDA_REGISTRATION_ENABLED=false`, bandera V2 inicialmente OFF y pin `COTIRONDA_PILOT_V2_RESPONDERS_RELEASE_SHA` exactamente igual a `VERCEL_GIT_COMMIT_SHA`. Habilitar únicamente tras probar permisos, consentimientos, Auth y SHA original.
6. **Primera transacción comercial**: el comprador autenticado ve un PDF real y Excel real correctamente asociados a una ronda; descargables bit a bit y con guías individuales. Probar archivo PDF ilegible, proveedor revocado, archivo con asociación ambigua y usuario ajeno (debe bloquear la revelación). No enviar WhatsApps salvo ronda y números consentidos y autorización explícita de publicación.
7. **Piloto completo**: ruteo por **catálogo real de producto y zona**, 2 días hábiles a las 18 con feriados actualizados por IA Central desde fuentes oficiales contrastadas, cierre real y análisis general de todas las ofertas; probar dos proveedores en una ronda y archivos originales.

## Pendientes actuales

**Bloqueo más inmediato:** Auth comprador + consentimiento V2 auténtico y persistencia de las RPC V2; ni siquiera el primer PDF se puede visualizar lícitamente hoy. El reloj/fuente oficial y resumen final son críticos para el hito completo, pero no deben impedir verificar primero la descarga segura del original.

**Fuentes:** [Supabase changelog noviembre 2026](https://supabase.com/changelog.md) incluye cambio breaking de CLI v3 (04/11) por lo que cualquier CLI futuro debe pinnear versión y verificar `--help`. [Vercel: despliegues](https://vercel.com/docs/deployments) recomienda validar proyecto, commit y entorno y no promover Preview como producción. El contrato D014 mantiene IA Central a cargo de calendario/equivalencias con verificadores y cálculos deterministas.

**No inventar tiempos restantes ni porcentajes de avance**. Un PR abierto no equivale al piloto online.
