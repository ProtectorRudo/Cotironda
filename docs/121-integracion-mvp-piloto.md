# 121 — MVP-002: candidatura de integración y puertas del piloto

**31/10/2026 · Issue #219 · Luz verde exclusivamente para desarrollo/pruebas.**

## Inventario verificado en GitHub

- Rama publicada `main` al auditar: commit `5987f1705ff1dba609489374531fa9e942150e7a`. Todavía es principalmente documentación inicial; no contiene las aplicaciones y motores de las ramas apiladas.
- Fuente integrada en prueba: `feat/mvp-001-demo-comprador`, commit `74309238aded8726ee02c3b95c4ea3443a8e3219` (PR #218, **draft**). Comparación GitHub de esa fuente con `main`: `ahead_by=1145`, `behind_by=0`, estado `ahead`, ancestro común el mismo commit de `main`. El endpoint de comparación devuelve 300 archivos como máximo: **NO se afirma que sean todos los archivos modificados**.
- Nueva rama de integración: `integration/mvp-piloto-20261031`, creada desde el commit exacto verificado del MVP, no desde `main`. No se reescribió el historial y **no** se fusionó nada a `main`.
- Tramo final de dependencias: D045 PR #194 → D047 #198 → D052 #208 → D053 #210 → D054 #212 → D055 #214 → D056 #216 → MVP-001 #218. Entre esos PR hay otros D046, D048-D051 y dependencias anteriores, presentes en la ancestría; no deben excluirse ni cherry-pickearse sin analizar.
- Hubo **más de 85 PR abiertos/draft** al auditar. Los PR especializados se conservarán como evidencia de revisión; no se marcarán cerrados/fusionados automáticamente.

**Decisión de seguridad:** no convertir todo ese historial en un solo commit *a ciegas* desde el conector. Para un PR compacto y revisable se requiere una copia Git auténtica y un snapshot verificado de árboles antes de realizar una operación de squash. La integración de esta etapa es un **PR borrador de control hacia main**, no una autorización de merge. El tamaño de esa diferencia exige revisión especial de los cambios de autenticación, permisos, Storage, SQL y canal WhatsApp.

## Valor entregado en MVP-002

- Ensayo transversal `tests/unit/mvp-integracion-contrato.test.mjs` que cruza la vista comprador existente MVP-001, el ciclo comercial sintético D045 y el comparador económico existente. Comprueba coincidencia de tres rubros, retención de material no seguro, ausencia de envíos, IA y precios reales, exclusión de proveedores con baja/sin consentimiento/fuera de zona, ofertas parciales sin ranking de total y adjudicación nunca automática.
- Mantener en CI las pruebas de PostgreSQL 17, PostgREST, seguridad del portal Next.js y el smoke HTTP real de `/probar`. No se crea un nuevo motor de comparación ni otro modelo económico.

## Camino crítico, sin fases decorativas

| Paso | Ya existe | Bloquea piloto real |
| --- | --- | --- |
| Pantalla comprador | Demo `/probar` en la rama de desarrollo, sin red | Conectar alta/empresa autenticada y persistencia real de solicitudes |
| Catálogo/productos | Clasificación determinista y catálogos sintéticos | Registrar comercios reales, rubros, zonas, SKU/opt-in, resolver dudas |
| Entrada archivos | Contratos de Storage privados y cuarentena probados parcialmente | Antivirus/quarantena real, extractor PDF/Excel/Word/imagen y revisión segura |
| Rondas/ofertas | SQL privado + pruebas PG descartable | Reconciliar migraciones, probar backup/restore DEV #175 y habilitar solo allí |
| WhatsApp | Broker/cola/adaptador protegidos; HTTP simulado | Canal Whapi real, secretos seguros, webhooks, consentimiento y coste real en piloto |
| Comparación/adjudicación | Motor exacto y manual para ofertas ficticias | Persistencia y validación de ofertas verdaderas/confirmadas, pantalla adjudicación |
| Sitio | Next CI y smoke HTTP aprobados | Preview Vercel protegida para esta rama, todavía sin URL validada |

## Bloqueos explícitos

1. **#175**: en Supabase DEV hay 17 migraciones (12 base + 5 de laboratorio IA D019–D021), distintas de las 12 reproducidas en GitHub. Hasta recuperar código/equivalentes, reconstruir y hacer backup + restore en aislado, **no instalar** rondas/Whapi en DEV, mucho menos producción.
2. **Vercel Preview**: en MVP-001 el 31/10/2026 la petición de Preview al proyecto `cotironda-portal-dev` recibió 402 `api-deployments-free-per-day`. No se inventa enlace, no se cambia el plan sin permiso ni se usa producción como atajo.
3. **Revisión del PR principal**: el merge hacia `main` puede activar automáticamente un despliegue vinculado al repositorio. **No fusionar** ninguna rama hasta revisar asociación Vercel, build desde limpio, secretos por entorno y autorización expresa de publicación.
4. **Piloto WhatsApp**: todavía no se enviaron mensajes reales consentidos ni recibieron cotizaciones verdaderas. No afirmar que el flujo comercial funciona en producción.

## Definición de primer piloto comercial

Un comprador real de prueba, al menos un proveedor voluntario por rubro usado, lista con materiales claros y dudosos, convocatoria únicamente a vendedores que comercializan el producto, cotización por WhatsApp, revisión/confirmación del proveedor, comparación de precios verificados (IVA/flete y cobertura), adjudicación manual, auditoría del costo y ausencia de duplicados. Prueba móvil no técnica. Suscripciones, dashboards y adjudicación automática quedan fuera.

El modo correcto para seguir es **integrar → ejecutar un ciclo real en DEV/piloto autorizado → corregir fricción → publicar cuando se autorice**, sin agregar nuevos subsistemas aislados.
