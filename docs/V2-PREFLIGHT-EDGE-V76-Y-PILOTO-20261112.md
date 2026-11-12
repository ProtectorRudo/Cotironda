# Cotironda V2 — Preflight de publicación (12/11/2026)

**Estado:** auditoría SOLO LECTURA del PILOTO y candidato de integración en rama. **NO DESPLEGADO**, ningún mensaje enviado, sin intervención sobre datos. No autoriza pasar a producción.

## Estado comprobado

Supabase `cotironda-piloto` (`ilggkalaafhtiysyzlmg`) funciona con PostgreSQL 17.11. Edge `cotironda-piloto-whapi` activo **v76**, `ezbr_sha256=656cb24bd1cbfdbb0de6d87a9acae17ad911c13b6e404667029dd4d0b55b822e`; seguimiento v29, auto-recovery v13.

Se contrastaron los **61 archivos** del bundle Whapi activo contra el código de la rama #819: **59 idénticos byte a byte, 2 diferentes**. Las diferencias exigen preservar código vivo, no reemplazarlo por el index histórico:

| Archivo | Qué difiere | Resolución en desarrollo |
| --- | --- | --- |
| `supabase/functions/cotironda-piloto-whapi/index.ts` | En v76: import del correlador **M336**, validaciones de `webhookSecretState`, contador y chequeo de conexión real **MVP333**. El `index.ts` base GitHub aún tiene parte del flujo anterior. | Snapshot literal del index v76 y generador de overlay V2 que preserva las mejoras activas, sin tocar el index histórico |
| `supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-mvp336.ts` | Fuente v76 de 16.235 caracteres distinta al archivo histórico de 16.668. | Snapshot exacto del correlador activo y un import explícito en el candidato |

Archivos: `scripts/piloto/baselines/cotironda-whapi-v76.index.ts.txt` y `supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-mvp336.v76-snapshot.ts`. No contienen credenciales hardcodeadas (búsqueda de patrones de secretos), pero **no reemplazan auditoría de claves/configuración**. El generator `scripts/piloto/v2-live76-candidate.mjs` exige SHA Git blob exacto y genera `index.v2-live76-candidate.ts` offline. **No ejecuta WhatsApp, SQL o deploy**. Antes de publicar se debe reconsultar Edge y verificar SHA+versión nuevamente; cualquier cambio posterior invalida el snapshot.

## Verificación de base y despliegues

La consulta segura `supabase/piloto/v2_release_preflight_readonly.sql`, ejecutada en PILOTO, devolvió:

| Control | Resultado |
| --- | --- |
| `auth.users` | 0 |
| Rondas en estado `prepared` | 1 |
| Bucket `cotironda-piloto-originals` privado, límite 8 MiB | Sí |
| RPC V2-02/03 nuevas instaladas | 0 de 5 |
| Tablas V2 de política, consentimiento y auditoría instaladas | 0 de 3 |
| Consentimientos antiguos de original (`mvp178`) | 0 |
| Restricciones heredadas de 3–7 días corridos | 2 |
| Preflight para publicar V2 | **NO APROBADO** |

**Bloqueo calendario:** los `CHECK` vigentes `requests_round_days_check` y `requests_exact_duration_check` obligan a 3–7 días enteros de 24 h. La regla V2, **2 días hábiles a las 18:00 en `America/Argentina/Buenos_Aires`**, exige una migración compatible, calendario de feriados y prueba de hora real. **No** quitar los checks sin definir antes nueva representación y pruebas de extremo a extremo, sin mutar rondas históricas.

**Bloqueo de asociación:** el único vínculo `ai_supplier_links_mvp225` existente usa `semantic_unique_mvp291`, no se acepta en la nueva vista privada de originales. No atribuir el PDF histórico ambiguo por fecha ni similitud; usar la correlación fuerte de PR #816/#817 en rondas nuevas con evidencia.

**Vercel:** existen al menos cinco proyectos Cotironda. El único claramente identificado como portal Next.js es `cotironda-portal-dev`; sus variables actuales de preview NO incluyen los nombres requeridos por los handlers V2 (nuevos `COTIRONDA_PILOT_*`). El proyecto `cotironda` tiene otra configuración. **Elegir UNA app PILOTO autorizada y alinear sus variables sin exponer secretos**. La pantalla V2 no puede funcionar solo porque Next.js compila.

**Auth/consentimiento:** comprador aún sin usuario Auth. Debe existir identidad real autorizada y mecanismo OTP/SMS configurado; consentimiento prospectivo del proveedor para mostrar su presupuesto original identificado al comprador al alta/invitación. No copiar permisos de WhatsApp genéricos ni inventar consentimiento. Consentimiento por proveedor, no por cotización.

## Próxima secuencia realista, sin multiplicar PR innecesarios

1. Revalidar snapshot de Edge v76 contra el desplegado y probar overlay CI (Node+Deno, sin secretos).
2. Implementar y probar cambio V2 de reloj/feriados en rama compatible, sin perder datos ni lógica comercial actual; resolver D013 por **producto** y zona sin filtrar por rubro.
3. Preparar y auditar migraciones de referencias #816/#817 + listado/descarga #818/#819, activar con **flags OFF**, sin presentarlas como operativas.
4. Resolver app Vercel piloto única, Auth y consentimiento real; verificar Storage/RLS y aislamiento de compradores.
5. Solo ante **`Publicalo`** para PILOTO autorizado: instalar cambios verificados por orden y hacer E2E real de un arquitecto → dos proveedores → dos originales → análisis individual → cierre de dos días hábiles → comparación.

**No hacer:** desplegar Edge histórico encima del v76, integrar #814 (prohibición de rondas simultáneas), revelar invitados sin respuesta, abrir originales sin Auth, enviar un WhatsApp de confirmación por cada presupuesto, inferir IVA/precios.

Referencia: [Contrato V2](COTIRONDA-V2-CONTRATO.md), [plan maestro](PILOTO-100-PLAN-MAESTRO.md), [estado V2](PILOTO-100-ESTADO.md), [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794).
