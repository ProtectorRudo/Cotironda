# Acta 497 — Publicación real B5h en cotironda-piloto

**Fecha:** 11/11/2026. **Autorización:** «Publicalo».
**Destino exclusivo:** Supabase piloto `ilggkalaafhtiysyzlmg`.
**Código publicado:** `7d2b8fc8dd974e659ac91f89c8f0d976cc98bb39`, [PR #772](https://github.com/ProtectorRudo/Cotironda/pull/772).
No se integró a ramas compartidas, no se desplegó Vercel ni producción.

## Instalación confirmada

- Migración aplicada: `cotironda_v2_b5h_private_total_diagnosis_20261111`.
- Tabla privada `v2_pdf_total_diagnostics_b5h`: RLS activo, sin SELECT para `anon` ni `authenticated`, sin ejecución pública de RPC. La ausencia de políticas RLS públicas es intencional; `service_role` conserva ejecución acotada.
- Edge `cotironda-piloto-v2-shadow`: versión **5**, estado **ACTIVE**; SHA de empaquetado `b44177e7560b86ef2cc7166d4a1f7e57eba4e437b4c04ba44b9ec022a367d799`.
- Reutiliza el doble factor y el cron existente; ningún token se mostró ni reemplazó.
- CI sobre commit de código: 6 workflows aprobados; 3.755 pruebas (3.745 aprobadas, 10 omitidas, 0 fallidas), Deno, PG17 con reversión y build Next.js.

## Ventana de reauditoría ejecutada

1. Preflight: `v2_shadow_settings.enabled=false`, `b5h_only=false`; los dos históricos B5g en revisión, B5d con 3 entradas, cero salidas WhatsApp pendientes.
2. Activación de ambos flags **solo durante la prueba**, de forma atómica.
3. Dos llamadas internas autenticadas por el Vault existente: solicitudes `pg_net` 2441 y 2442, HTTP 200, exactamente **dos** resultados completos en la tabla privada B5h.
4. Cierre y comprobación posterior de `enabled=false`, `b5h_only=false` y claim B5h `disabled`. Cero leases pendientes.

### Diagnósticos comprobados

| Documento | Renglones cotejados | Diagnóstico total | Etiquetas de total reconocidas | Coincidencias numéricas |
|---|---:|---|---:|---:|
| PDF histórico 1 | 2/2 | `unlabeled_amount_found` | 0 | 1 |
| PDF histórico 2 | 5/5 | `unlabeled_amount_found` | 0 | 1 |

En ambos, `proof_reason=source_total_unverified`. La presencia de la cifra coincidente en el texto del PDF **no** acredita que represente el total final: falta identificar su ubicación, rótulo o contexto documental. Los dos siguen en estado `private_diagnosed`, con `source_verified=false`, `can_publish=false` y `can_rank=false`. No inferir importes por suma ni relajar validación.

## Revisión de regresiones posterior

- B5d: 3 registros conservados, sin incremento.
- B5g: 2 registros conservados, sin incremento.
- `offer_versions`: 0 entradas nuevas desde el inicio de B5h.
- Ofertas anónimas públicas: 0.
- Mensajes WhatsApp pendientes: 0.
- Edge/SQL sin lectura pública y ambos flags apagados.
- Observación Supabase Advisor: INFO sobre RLS activo sin políticas en tabla privada B5h; configuración deliberada.

## Próximo cambio propuesto (sin autorización de publicación)

B5i debería ubicar la coincidencia numérica en coordenadas PDF.js y analizar encabezados cercanos y rótulos alternativos. Clasificar una cifra final solo cuando corresponda inequívocamente al total del documento; auditar IVA, flete, cargos y el resto de las páginas. Mantener registro privado, versionado, sin IA adicional, sin mensajes ni ofertas.

**No declarar el piloto E2E terminado:** el motor aún no ha certificado totales ni homologación completa para el comprador. Los PR apilados siguen pendientes de integración a la rama definitiva.
