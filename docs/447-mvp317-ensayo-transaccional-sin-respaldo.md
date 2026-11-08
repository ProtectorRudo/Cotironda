# Decisión 447 — MVP317: ensayo transaccional mientras no hay respaldo

**Fecha:** 08/11/2026, ART. **Autorización:** «avanza igual» en continuidad del desarrollo. **Alcance:** solo código, lectura del piloto y pruebas en una base PostgreSQL17 efímera. No implementar cambios en `cotironda-piloto`, ni activar Whapi, cron o producción. El responsable confirmó que NO tiene un respaldo recuperable.

## Hallazgo en el piloto real, solo lectura

Se verificaron las tres restricciones históricas necesarias para MVP310:
- `participants_key_check`: solo `arquitecto`, `corralon_ailin` y `corralon_nahuel` actualmente.
- `participants_check`: compradores sin zona de entrega; proveedores con zona.
- `requests_buyer_key_check`: comprador identificado como `arquitecto`.

Se comprobaron únicamente **conteos agregados**: **3 participantes = 1 comprador y 2 proveedores**; **0 claves inválidas** para `^[a-z][a-z0-9_]{2,60}$`; **0 incompatibilidades** con la nueva condición de rol y ciudad. No se inspeccionaron ni exportaron teléfonos, contraseñas, nombres particulares o contenido de presupuestos. Esto valida una dependencia de instalación, pero no prueba todas las rutas comerciales.

## Qué se desarrolló

- `mvp317-generar-baseline-pg17.mjs`: recrea un snapshot **sintético previo a MVP309**, toma como referencia el fixture MVP308, los 14 cuerpos de funciones antiguas congeladas en MVP311 y las tres restricciones comprobadas en el piloto. Nunca obtiene datos reales.
- `mvp317-fallo-inyectado-pg17.sql`: en una transacción aplica MVP309, 310, 311, 312 y 312B; luego lanza una excepción deliberada. El ejecutor `psql` sale con error y cierra la conexión, produciendo el rollback.
- `mvp317-ensayo-atomico-pg17.sql`: instala **los nueve archivos** MVP309, MVP310, MVP311, MVP312A, MVP312B, MVP312C, MVP313, MVP314 y MVP315 en **UNA sola transacción** con `lock_timeout`, `statement_timeout`, verificación de funciones reservadas y gates SQL OFF. Solo funciona si `current_database() = 'cotironda_ci'` y usuario `postgres`.
- `mvp317-ensayo-atomico-pg17.sh`: se niega a correr salvo en host `127.0.0.1:5432`, base `cotironda_ci`; coteja antes/después los SHA-256 de 3 RPC históricas, conteo de participantes/rondas, 3 restricciones y ausencia de tablas nuevas tras el fallo; luego prueba la instalación correcta con los gates OFF y las filas existentes intactas.
- Workflow `cotironda-mvp317-atomic-rehearsal.yml`: PostgreSQL17 aislado en GitHub Actions, credenciales de CI ficticias; **sin secretos de Supabase ni Whapi**.

## Límite de seguridad irrenunciable

Un `ROLLBACK` **protege de fallos ANTES del `COMMIT`**; NO reemplaza un backup después de una migración ya confirmada. Un script puede pasar CI y aun así afectar una dependencia no incluida en los fixtures. Sin copia restaurable, la publicación sobre datos reales seguiría suponiendo riesgo de pérdida y no tendría recuperación garantizada.

Aun cuando el operador autorice asumir riesgo, no se debe presentar como segura una base sin backup. Esta tarea **no instala nada en el piloto**. Para su publicación hacen falta la orden «Publicalo», los controles específicos de entorno, el plan de recuperación y una verificación real de Whapi antes de enviar. No pagar servicios hasta definir la solución de menor costo.

## Criterios de aceptación

- [ ] Test de fallo a mitad de migraciones: error previsto y rollback integral verificado, sin pérdida de filas ni modificación de RPC/constraints.
- [ ] Test de instalación transaccional de los nueve SQL: todos presentes, roles y RLS correctamente cerrados, gates OFF.
- [ ] Regressiones originales MVP309, MVP312, MVP314, MVP315, PostgreSQL17 y Next.js aprobadas.
- [x] Restricciones actuales y conteos de compatibilidad MVP310 comprobados en el piloto, sin cambios.
- [ ] PR revisado y fusionado a desarrollo. **No significa piloto publicado**.

**Decisión:** desarrollo sin detenerse por la falta de backup, pero prohibido confundir el ensayo en entorno desechable con una recuperación real.
