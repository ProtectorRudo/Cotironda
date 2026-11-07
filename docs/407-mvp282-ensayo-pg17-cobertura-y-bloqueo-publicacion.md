# Decisión 407 — MVP282: ensayo PG17 sintético completo por cobertura, publicación bloqueada

Fecha: 06/11/2026 (Argentina). Issue #665. Autorización: **Luz verde en desarrollo**, ninguna modificación de `cotironda-piloto`.

## Hallazgo

El preflight MVP281 comprobó el estado REAL del piloto (SQL reciente hasta MVP239; los nuevos componentes no instalados), y creó un manifiesto de **21 archivos** candidatos MVP245–280. Para evitar falsos positivos, se auditó cómo se prueban actualmente esos SQL: existen **11 fixtures PG17 transaccionales** que, en conjunto, importan los 21 archivos. Las coberturas acumulativas más relevantes incluyen MVP259+260, MVP262+263+264+265+266+267, MVP248+250 y MVP276+278+279+280.

La nueva herramienta `scripts/piloto/mvp282-pg17-modular-rehearsal.mjs` comprueba que cada SQL esté realmente importado por alguno de estos fixtures, que los fixtures tengan `BEGIN/ROLLBACK`, que no contengan comandos de salida externa y que PostgreSQL solo opere contra `localhost:5432/cotironda_ci`. El workflow ejecuta los **11 fixtures secuencialmente** en un PostgreSQL17 aislado y verifica tras cada uno que no quedaron esquemas creados.

### Distinción crítica

**Pasar los 11 fixtures NO equivale a aplicar las 21 migraciones juntas sobre una misma base con el esquema completo MVP239.** Cada fixture construye un subconjunto sintético del esquema y termina con `ROLLBACK`. El laboratorio valida módulos y grupos de dependencias, no garantiza compatibilidad de los cambios consecutivos en un clon fiel de la base.

No anunciar las 21 como «integradas en PILOTO» ni el lanzamiento sin esa última comprobación.

## Ruta para instalar posteriormente

1. Obtener una copia de **solo esquema** del proyecto `cotironda-piloto` por un procedimiento privado (NO publicar datos, credenciales, definiciones sensibles de Vault ni tokens en GitHub); inspeccionar que no incluya PII.
2. Restaurar en PostgreSQL17 **aislado**, ejecutar las 21 migraciones **en el orden del manifiesto**, revisando previamente dependencias y funciones `SECURITY DEFINER`. Probar diferencias del esquema, ACL/RLS, rollback e idempotencia. Mantener flags, envíos y tareas nuevas apagados.
3. Hacer respaldo recuperable y recuperación ensayada, o documentar el riesgo residual que implica mantener respaldo contratado en Plan B.
4. Solo ante una autorización explícita **«Publicalo»** específica para piloto: instalar por fases con verificaciones posteriores de infraestructura/Edge/Vercel. No encender automáticamente Whapi ni cron supervisor.
5. Recién luego realizar E2E con compradores/proveedores reales consentidos (texto y archivos, revisión exacta, catálogo, PDF, presupuestos, ranking y cierre).

## Evidencias y límites

- Los SQL sintéticos y sus informes de CI no contienen HMAC reales, compradores, archivos, números ni presupuestos.
- Los checks Vercel externos reportados en el PR anterior indicaron límite de compilaciones de cuenta. No contratar por cuenta propia.
- No se ejecutan consultas SQL de escritura ni migraciones sobre Supabase PILOTO en esta etapa.
- La herramienta se niega a usar `db.ilggkalaafhtiysyzlmg.supabase.co` o otra base que no sea CI local.
- El respaldo contratado sigue siendo Plan B sin compras; permanece pendiente un ensayo de recuperación de datos reales del piloto.

**Salida del MVP282:** cobertura verificada y prueba PG17 de once conjuntos; evidencia explícita de que todavía falta el ensayo acumulativo antes de la publicación.
