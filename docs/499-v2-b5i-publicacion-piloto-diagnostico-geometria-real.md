# Acta 499 — publicación controlada de B5i en el piloto

**Fecha:** 11/11/2026. **Autorización:** «Publicalo».
**Alcance:** exclusivamente Supabase `cotironda-piloto` (`ilggkalaafhtiysyzlmg`). Sin deploy de Vercel ni publicación en producción.
**Commit de código publicado:** `0a50796cd45d9cb5222d8cf5bb7c862cb13476f5` ([PR #773](https://github.com/ProtectorRudo/Cotironda/pull/773)).
Los PR apilados no se integraron por esta publicación.

## Instalación y validación previas

- GitHub: 6/6 workflows aprobados en el commit de código publicado, incluidas las pruebas Node específicas, regresión general, Deno con PDF.js, PostgreSQL 17 con ROLLBACK, PostgREST y build Next.js.
- Regresión de código: **3.789 tests**, 3.779 aprobados, 10 omitidos, cero fallidos.
- Migración **`cotironda_v2_b5i_private_total_geometry_20261111`** aplicada exitosamente sobre el piloto. Tabla nueva `cotironda_piloto_privado.v2_pdf_geometry_diagnostics_b5i`, RLS activo, lectura y RPC negadas a `anon` y `authenticated`. Ejecución del servicio restringida a `service_role`.
- Nuevo switch SQL `b5i_only`, valor inicial **FALSE**, mutuamente excluyente con `b5h_only`.
- Edge `cotironda-piloto-v2-shadow`: versión **6**, estado **ACTIVE**, 18 archivos, checksum `86e4162c1c526378a739110459b371ffe3ed3e1c38c26c46b93925e5ef7365e4`. Se mantuvo el mecanismo de autenticación interno y el archivo Whapi firmado original, sin modificaciones ni claves nuevas.

## Reauditoría real de los dos PDF históricos

Preflight: V2, B5h y B5i SQL OFF; dos candidatos B5h `unlabeled_amount_found`; B5d 3 registros, B5g 2, cero mensajes pendientes. Token existente validado dentro de la base sin devolver su valor.

Se abrió una ventana exclusiva `enabled=true, b5i_only=true, b5h_only=false`. Dos llamadas al puente interno existente por Vault, solicitudes `pg_net` **2449** y **2450**, ambas **HTTP 200**. Se registraron exactamente dos resultados completos en el ledger B5i.

Después de la prueba, se apagaron **los tres flags**, y se comprobó nuevamente en SQL: `enabled=false`, `b5h_only=false`, `b5i_only=false`; RPC de claim devuelve `disabled`, cero tareas B5i pendientes.

### Resultado comercial observado — privado, no homologado

| Evidencia | PDF histórico 1 | PDF histórico 2 |
|---|---|---|
| Estado | `private_diagnosed` | `private_diagnosed` |
| Código geométrico | `amount_after_material_table` | `amount_after_material_table` |
| Contexto | `no_recognizable_label` | `no_recognizable_label` |
| Columna | `aligned_material_total` | `aligned_material_total` |
| Coincidencias del importe | 1 fila / 1 celda | 1 fila / 1 celda |
| Materiales ubicados | 2 | 3 |
| Renglones originales cotejados | 2/2 | 5/5 |
| Páginas | 1 | 1 |
| Publicable / rankeable | **NO / NO** | **NO / NO** |

**Interpretación permitida:** en cada PDF, una única celda numérica coincide con el importe declarado, está por debajo de la tabla de materiales y alineada con la columna donde aparecen los importes de materiales. No se identificó una etiqueta de total final reconocible. La ubicación es evidencia estructural prometedora, pero **no prueba todavía que la cifra sea el importe final con todos los conceptos**, especialmente IVA, fletes, descuentos, cargos y notas.

**Prohibiciones explícitas:** no marcar `source_verified=true`, no mostrar el total como certificado, no comparar presupuestos de distinta cobertura, no publicar ofertas, contactos o adjudicaciones por esta correlación.

## Revisión de efectos y seguridad posterior

- B5d conservó sus 3 registros anteriores.
- B5g conservó 2; B5h conservó 2.
- B5i: 2 completos y cero leases.
- Cero nuevas versiones de oferta desde el comienzo de B5i.
- Cero ofertas anónimas públicas.
- Cero mensajes salientes de WhatsApp pendientes.
- Tabla B5i con RLS y lectura denegada a roles públicos.
- Production/Vercel y cron original no modificados.

## Próxima corrección recomendada

No sumar otro motor grande ni volver a leer mediante IA lo ya cotejado. Proponer una **verificación económica B5j independiente y determinista**, que compruebe si el total situado al pie coincide con todos los renglones y cargos identificados, aplicando descuentos, IVA/flete solo si están explícitos, cobertura total del documento, notas y condición comercial. Ante cualquier concepto sin precio o ambigüedad, mantener revisión. La certificación final requiere reglas comerciales y equivalencias probadas antes del ranking.

**Estado general:** B5i está publicado en piloto, pero Cotironda aún no supera una prueba integral nueva de comprador → proveedores → presupuesto → comparación → cierre y revelación.
