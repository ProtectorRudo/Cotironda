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

## Dos puertas separadas: instalar con flags OFF y luego activar el piloto

El **control `primer_original` no es una autorización para instalar infraestructura**. Incluye una prueba auténtica de navegador y por eso se evalúa **DESPUÉS** del primer despliegue autorizado, no antes. Para evitar un círculo imposible (hoy `auth.users=0` y el OTP del portal usa `shouldCreateUser:false`), la secuencia segura tiene dos puertas:

1. **Instalación de infraestructura apagada**, exclusivamente tras el comando **«Publicalo»**: verificar proyecto, GitHub SHA, backup/rollback, última versión Edge Whapi y SQL exacta. Instalar solo en PILOTO las RPC/tablas de V2, Edge PDF aislada y Preview Vercel con todas las banderas V2 OFF. No compartir archivos ni enviar WhatsApps, no cambiar producción. No se requiere que ya exista un comprador para **instalar con flags OFF**.
2. **Alta/Auth y consentimientos reales**: con el portal ya alcanzable por Preview protegida, un operador autorizado prepara el primer arquitecto en Auth por vía segura de onboarding. El OTP usa `shouldCreateUser:false`, por lo tanto **no puede registrar por sí solo al primer usuario**. Registrar consentimiento prospectivo de cada proveedor sobre exhibición de nombre y original, con evidencia auténtica; no inferirlo del opt-in previo.
3. **Activación controlada del primer original**: revalidar JWT + sesión, consentimientos, asociación documental fuerte y SHA del documento; habilitar solo los flags V2 autorizados para PILOTO. Ejecutar comprobaciones negativas de identidad ajena/revocación y descargar el PDF/Excel original desde navegador de comprador; comprobar su guía IA no bloqueante. Reejecutar `primer_original` con observación nueva y testimonios de prueba (sin PII en el repositorio).
4. **Piloto comercial completo**: sincronizar/validar calendario por IA Central y activar plazo de 2 días hábiles solo con evidencia; ronda real 1 arquitecto→2 proveedores→dos originales→cierre automático→informe general. Reejecutar `piloto_completo`, sin convertir CI en prueba real.

En todas las fases, cualquier migración, deploy o activación requiere autorización expresa `Publicalo` para el entorno indicado. **«Avanza» permite desarrollar y probar sin publicar**, como hasta ahora.

## Secuencia técnica de preparación (sin instalar)

- Congelar y revalidar el árbol exacto de PR #816→#827, CI final y compatibilidad de los **61 archivos** del Edge Whapi v76 activo; detenerse si cambia el hash vivo.
- Revisar las migraciones SQL y restricciones históricas bajo transacción sintética PG17, con backup y plan de reversión. Instalar V2-02→V2-03a→V2-03b→V2-04b y D013→V2-05 según dependencias SHA pinned; el contrato de cobertura por producto D013 no permite filtrar por rubro.
- Preparar variables Preview Vercel **solo nombres y permisos**; secretos en el proveedor, no en GitHub/WhatsApp ni en chat. Lector PDF separado bajo `verify_jwt=false` con secreto opaco largo verificado dentro de la propia función, flag OFF hasta la activación.
- Prohibido atribuir originales históricos ambiguos a una ronda V2 por similitud o antigüedad; un solo PDF/XLSX no constituye prueba de dos proveedores.

## Pendientes actuales

**Bloqueo más inmediato:** Auth comprador + consentimiento V2 auténtico y persistencia de las RPC V2; ni siquiera el primer PDF se puede visualizar lícitamente hoy. El reloj/fuente oficial y resumen final son críticos para el hito completo, pero no deben impedir verificar primero la descarga segura del original.

**Fuentes:** [Supabase changelog noviembre 2026](https://supabase.com/changelog.md) incluye cambio breaking de CLI v3 (04/11) por lo que cualquier CLI futuro debe pinnear versión y verificar `--help`. [Vercel: despliegues](https://vercel.com/docs/deployments) recomienda validar proyecto, commit y entorno y no promover Preview como producción. El contrato D014 mantiene IA Central a cargo de calendario/equivalencias con verificadores y cálculos deterministas.

**No inventar tiempos restantes ni porcentajes de avance**. Un PR abierto no equivale al piloto online.
