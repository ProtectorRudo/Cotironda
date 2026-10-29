# 27 — Auditoría de aislamiento de proyecto y limitación de intentos

**Estado: corrección en rama de desarrollo. Sin publicación ni habilitación.**

## Hallazgo 1 — Riesgo de conexión a otro negocio
El guard anterior aceptaba cualquier referencia de 20 letras si coincidía con la URL. Una configuración coherente pero incorrecta podía apuntar a Viralio o TeHiceEsto.

**Corrección:** `src/server/portal-entorno.ts` exige exactamente `qkercsoqhehbenbbncwk` (Cotironda dev); también impide habilitar el registro si `VERCEL_ENV=production`. Los tests comprueban que **ambas referencias de los otros proyectos son rechazadas incluso cuando URL y referencia coinciden**, además de rechazar una referencia arbitraria.

## Hallazgo 2 — Falso control de frecuencia
La ruta real `/api/organizaciones` usaba `autorizarIntento: async()=>true`. Ese marcador no limitaba solicitudes y era peligroso si alguien habilitaba el flag del portal.

**Corrección conservadora:** la ruta ahora invoca `rechazarIntentosSinLimitador` y recibe 503 sin escribir datos. El módulo es intencionalmente no funcional para altas: debe reemplazarse por un limitador **durable y atómico** (no memoria local, porque Vercel puede ejecutar varias instancias). Se probó que no llega a persistencia ni permite altas cuando el resto de configuración está activada. No se almacenan direcciones IP ni otros datos personales en esta etapa.

La RPC directa de Supabase no pasa por la ruta de Vercel; el flag `cotironda_private.registration_settings.enabled=false` impide esas altas mientras está apagado. **Antes de habilitarlo**, se requiere limitación real de intentos en la capa RPC / infraestructura, tests de concurrencia, controles antiabuso y presupuesto.

## Criterios de aceptación antes de abrir registros
1. Resolver limitador durable de la API y de la RPC directa, preferentemente de menor costo y con cuotas justas por usuario, sin presionar a proveedores.
2. E2E real JWT/Auth Hook con usuarios y cookies; ninguna prueba actual prueba firma en vivo.
3. QA de casos normales/extremos, seguridad PostgREST y revisión de PRs apilados.
4. Flag web/DB en false hasta autorización expresa de publicación.
