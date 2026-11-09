# MVP324 — Preparación del bundle de seguimiento del comprador, sin despliegue

**Fecha:** 09/11/2026 (ART). **Autorización:** «Luz verde»: desarrollar, verificar y documentar, **sin publicar** SQL, Edge ni Vercel. No modificar Whapi, cron, cuotas, envíos ni producción.

## Lectura real del piloto antes de preparar la publicación

- Proyecto Supabase **cotironda-piloto**, ref `ilggkalaafhtiysyzlmg`.
- Edge `cotironda-piloto-seguimiento` versión **25**, ACTIVE, `verify_jwt=false` con autorización interna propia y token privado del comprador. No alterado.
- La descarga autenticada de la versión activa contiene **29 archivos**. Se cotejó cada uno contra GitHub `feat/mvp174-supplier-packaging-equivalence` en el merge commit `9ab239ebc76d9291bc0f7d2b9170457e37af02d9`: **28/29 idénticos**. El archivo distinto es exclusivamente `supabase/functions/cotironda-piloto-seguimiento/index.ts`.
- Se comprobó por eliminación exacta de la importación y del bloque MVP322 que dicho `index.ts` nuevo equivale **byte por byte** al original en ejecución. El archivo antiguo coincide a su vez con Git blob SHA1 `9c38a10ba6b4ffd726ad2348a748b1598954bffc` de GitHub antes del MVP322. No existen cambios ocultos de rutinas de token, permisos, cierre ni respuesta HTTP.
- El código nuevo solo añade **un** módulo puro `src/domain/ia-central/preliminar-anonimo-presupuestos-mvp322.ts`. Para desplegar correctamente la nueva función, el paquete debe contener las **33 rutas exactas** derivadas del grafo de importación, manteniendo la política previa `verify_jwt=false`, el mismo nombre/entorno y la autenticación interna.
- Baseline SQL: PostgreSQL 17.11, hashes SHA256 de RPC buyer MVP227 y cierre MVP303 coincidentes con el guard MVP323; 3 participantes, 5 rondas y 7 originales, 0 despachos pending/leased/uncertain. Gates de MVP306, MVP314 y MVP315 **OFF**. Estas lecturas sirven solo para ese momento; al publicar deberán repetirse para evitar TOCTOU.
- Vercel seguimiento en vista previa READY con el código MVP322; el sitio del arquitecto de producción **no se cambió**. El proyecto Vercel principal tiene control fallido por cuota gratuita, no se debe exigir pagar ni saltear una política.

## Implementación de desarrollo

`scripts/piloto/mvp324-bundle-seguimiento-readonly.mjs`: inspección local sin acceso a servicios. Recorre imports estáticos TS recursivamente, rechaza rutas externas, imports dinámicos, tamaño inesperado, archivos faltantes, dependencias fuera de las **33 rutas auditadas**, fuente no pura e importaciones repetidas. Retira únicamente la importación y el bloque MVP322 de la fuente candidata y exige que el contenido restante tenga exactamente el Git blob SHA1 de la Edge activa. Devuelve exclusivamente rutas, hashes de referencia y estado; no imprime ningún secreto ni modifica archivos.

`tests/unit/mvp324-bundle-seguimiento-readonly.test.mjs`: confirma el bundle positivo y casos negativos sintéticos: modificación de lógica heredada, falta de proyección, import repetido, dependencia inesperada e import dinámico.

CI `.github/workflows/cotironda-mvp324-bundle-seguimiento-readonly.yml`: Node 22.16.0 aislado, sin secretos ni conexión a Supabase/Vercel/Whapi. **No ejecuta SQL ni despliega**.

## Pasos que siguen requiriendo «Publicalo»

1. Nueva lectura de Supabase y verificación exacta de hashes de MVP227/MVP303, gates OFF y ausencia de trabajo en estado incierto. Precaución: el operador eligió avanzar sin backup recuperable; no hay rollback de cambios ya confirmados.
2. Instalación transaccional exclusivamente en el piloto de `mvp323_numeracion_anonima_estable.sql`. Verificación posterior de permisos, funciones y datos.
3. Revalidar la versión activa de Edge y las 29 fuentes guardadas contra GitHub; desplegar el bundle **de 33 archivos** y verificar que sea ACTIVE sin exponer claves, sin disparar WhatsApps ni variar los toggles.
4. Publicar solo el proyecto Vercel del seguimiento de piloto, no el proyecto principal; confirmar commit y entorno exactos y validar el enlace privado del comprador.
5. Verificar visor anónimo, artículo y subtotal con fuente, que se respete IVA/flete, labels fijos, temporalidad del cierre, revocación de token y ausencia de PII. **CI sintético no es evidencia de una ronda real**.

**No se ejecutó ninguno de los cinco pasos de despliegue bajo esta «Luz verde».**
