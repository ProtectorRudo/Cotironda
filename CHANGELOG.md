# Registro de cambios Cotironda

## [PILOTO PUBLICADO] — 14/11/2026 — Pausa segura del cron cierre V1

- Supabase `cotironda-piloto` migración **`20261114093622`**: `cotironda_v2_pause_legacy_close_cron_only_pilot_20261114`. Suspendió exclusivamente `cron.job` job1 `cotironda_piloto_close_due_5min` heredado de V1, mediante `cron.alter_job(...active=>false)` sin borrarlo. Conserva cron job3/4.
- Preflight exige PG17, job exacto, 7 rondas (5 cerradas, 2 borradores, 0 preparadas) y todas las políticas V2 OFF. Simulación SQL en transacción `BEGIN/ROLLBACK` real comprobada y posterior migración `success=true`; poscontrol: job1 OFF, jobs3/4 ON; 7 rondas sin cambios y cero consentimientos.
- [PR #852](https://github.com/ProtectorRudo/Cotironda/pull/852) · [Acta](docs/PILOTO-V2-CRON-V1-SUSPENDIDO-20261114.md). Rollback separado `REVIEW_ONLY` necesita autorización explícita; no volver a activar cierre V1 para V2.
- Ningún WhatsApp, acceso privado, Vercel ni producción modificados. Piloto E2E no completado; Preview f985 402 por cuota y clave `sb_secret_` Supabase todavía ausente.


## [Sin publicar] — 14/11/2026 — Relevo corto y foco piloto real

- AGENTS.md queda en **3.421 caracteres**, menos de 3.500. V2 vigente, prioridad WhatsApp y ronda comercial real, no versiones anteriores.
- Estado compacto: 86.729 a 4.239 caracteres; un solo bloqueo real: credencial sb_secret de Supabase ausente en Vercel Preview, con HMAC ya creada; flags V2 apagados.
- Plan maestro: 90.751 a 4.794 caracteres; seis bloqueos en secuencia, prueba E2E de comprador y dos proveedores, sin mejoras secundarias.
- Historial anterior preservado completo en Git SHA 7ea6863deb38415a518d5c80788d5210a9fca75e. Ramas anteriores pueden contener instrucciones V1 no vigentes.
- Solo documentación de la rama V2; cero cambios en WhatsApp, Vercel, Supabase o producción. Piloto NO terminado.


## [Sin publicar] — 12/11/2026 — D013 / catálogos por producto y equivalencias

- **Decisión DOCUMENTADA, sin código ni despliegue:** distribución por coincidencia de productos concretos del catálogo propio de cada proveedor, nunca por rubro/nicho. La IA comprende sinónimos, nombres comerciales (Ceresita/hidrófugo compatible), marcas flexibles y presentaciones (cemento 50/25 kg normalizado en masa), sin falsear equivalencias técnicas.
- Se actualizan Contrato V2, Plan/Estado, AGENTS, decisión D013 e Issue #794; V2-00 continúa como única próxima tarea técnica y V2-01 incorporará pruebas de matching por artículo.

## [Sin publicar] — 12/11/2026 — D012 / reorientación V2

- **Documentación, no código ni despliegue.** Dirección única: solicitudes por catálogo/zona; negocios identificados al responder, original exacto y análisis individual breve útil; durante ronda **solo respondedores**; cierre en **dos días hábiles** y análisis general comparativo justificado.
- Se sustituyen reglas de anonimato, ganadores obligatorios, listas de pendientes, plazo de cinco días y confirmaciones rutinarias. **PR #814 se marca NO DESPLEGAR tal como está:** un proveedor debe poder cotizar varias rondas concurrentes.
- Contrato, plan maestro, estado, README, AGENTS, reglas, roadmap, decisiones e Issue #794 se consolidan; copias íntegras de plan/estado/issue previos en `docs/historico/`.
- Los cambios NO implican que V2 exista en PILOTO. E2E WhatsApp→dos originales→vista comprador→informe final y descargas sigue PENDIENTE.

## [Histórico] — Etapa 00 inicial
- Primera documentación del producto de licitaciones/rankings (ahora reemplazada por D012); conservar commits previos como evidencia.
