# Acta 515 — B5o: publicación en piloto y relectura histórica

**Fecha:** 11/11/2026. **Autorización:** «Publicalo», limitada a `cotironda-piloto` (`ilggkalaafhtiysyzlmg`), sin producción, Vercel ni WhatsApp. **Código exacto:** commit `99095f784574d31ec20db55e9e46db1837eae819` de [PR #786](https://github.com/ProtectorRudo/Cotironda/pull/786), apilado sobre [PR #785](https://github.com/ProtectorRudo/Cotironda/pull/785).

## Verificación previa

- 6/6 workflows generales de GitHub y 4/4 específicos B5o aprobados (Node, Deno/PDF.js, PostgreSQL 17 ROLLBACK y regresión); Next.js PASS.
- Supabase piloto: Edge V2 `cotironda-piloto-v2-shadow` v10 ACTIVE con 23 archivos; cinco flags V2 apagados; B5k=1, B5m=1, B5n=1, B5o=0, cero leases.
- Predecesor privado real: B5n `source_part_mixed` en condición ordinal 4/5, subtotal de materiales conciliado y `can_publish=false`. Se probó elegibilidad por fuente histórica y SHA sin extraer textos del proveedor.
- Sin cambios en WhatsApp outbox (6 históricos), ofertas anónimas (0), versiones de oferta (1), finalistas (0); cron documental existente activo y sin mensajes pendientes de enviar.

## Actualización aplicada

1. Migración Supabase aplicada `cotironda_v2_b5o_final_pdf_replay_privado_20261111` (versión registrada `20261111184454`). Se extendió `processor_version` en el ledger privado existente y se actualizaron 4 funciones SQL privadas (B4, B5o gate, claim y finish). Sin crear tablas, colas, cron ni credenciales.
2. Postflight SQL: los cinco flags siguieron OFF, B4/B5o gates OFF, 0 leases, B5o=0; RLS activa y permisos `anon/authenticated` bloqueados.
3. Edge `cotironda-piloto-v2-shadow` **v11 ACTIVE**; SHA `484678506bdbd5d51dae0ee920993d56a734fe93bcdae831b40870fc587ac45a`. Paquete con 23 archivos; únicamente los módulos `auditoria-cobertura-original-b5l.ts` (doble referencia de nota y condición) y `worker-moneda-original-b5k.ts` (versión B5o) cambiaron desde v10.
4. Ventana privada armada el **11/11/2026 18:46:05 UTC**, utilizando la autorización de cron B4 ya existente, sin extraer secretos de Vault ni realizar invocación HTTP manual. Gate B4 TRUE confirmado. La ventana expira automáticamente luego de 8 minutos; al tomar el PDF, el propio claim desactiva ambos flags en la misma transacción.

## Resultado de la única relectura real

**PENDIENTE DE COMPROBACIÓN AL MOMENTO DEL PRIMER REGISTRO.** No afirmar que el cron o el PDF se procesaron solo por haber aplicado SQL y desplegado Edge. Se completará en esta misma acta con la evidencia postflight.

## Seguridad y alcance

- El replay no publica ofertas ni rankings, ni envía WhatsApps, adjudica, revela contactos o certifica el total final. Todos los indicadores `source_verified`, `can_publish`, `can_rank`, `can_reveal_contacts` permanecen FALSE incluso si mejora la cobertura.
- El flete mencionado sin importe no equivale a gratis, `$` no prueba moneda ISO y IVA sin evidencia no se deduce. No comparar los totales de ofertas incompletas.
- Los PR #785/#786 permanecen abiertos y no fusionados. No se modificó producción.

## Próximo objetivo de negocio

Una vez documentado el resultado B5o, priorizar **Issue #750 (E2E)**: correlación de PDF y Excel con la ronda correcta, condiciones económicas verificables, comparación B6 por rubro y cantidad/cobertura, seguimiento anónimo durante la ronda, revelación al cierre y prueba real WhatsApp con dos proveedores. Evitar nuevas versiones de replay aisladas sin un criterio comercial claro.
