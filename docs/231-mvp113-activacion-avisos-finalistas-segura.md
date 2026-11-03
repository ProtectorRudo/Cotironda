# MVP-113 — activar avisos finalistas solo desde el inicio real del piloto

**02/11/2026 — Issue #437 — rama de desarrollo, NO publicada.** Se revisaron contrato docs/223, ronda integrada docs/230, SQL MVP-110 y Edge `cotironda-piloto-finalistas`.

## Riesgo identificado y corregido en código

El worker de MVP-110 ejecuta en cron `cotironda_piloto_prepare_finalists_due_mvp110`, que recorría todas las rondas históricas cerradas. Si se desplegara en un entorno con contactos cifrados y consentimiento previamente otorgado, podría **enviar avisos antiguos o exponer al comprador finalistas de rondas anteriores**. Los límites de 1–2 proveedores y los controles de consentimiento no bastan para evitar este backfill.

El MVP-113 agrega una barrera privada única: `cotironda_piloto_privado.finalist_activation_mvp113`. Al instalarse está **apagada**: `enabled=false, activated_at=null`; RLS activa y ningún acceso DML a `anon`, `authenticated` ni `service_role`. Solo una intervención explícita de administrador autorizado en el entorno PILOTO debe establecer un instante de activación **posterior o igual al momento actual** y habilitarlo, tras ejecutar todas las verificaciones. **No hay RPC pública ni workflow que lo habilite.**

Guardias activas:
1. **Cola:** no prepara avisos si el interruptor está apagado; una ronda cuyo `created_at` sea anterior a la activación queda excluida aun con WhatsApp habilitado en las banderas previas.
2. **Cron privado:** no crea plan ni prepara avisos para rondas históricas.
3. **Claim de worker y autorización previa a Whapi:** rechazan solicitudes si se apagó, y nunca toman una fila histórica, aunque hubiera quedado en outbox.
4. **Enlace privado del comprador:** no revela contactos de rondas históricas o al apagar el interruptor, incluso con un token todavía vigente.
5. Continúan los controles anteriores de consentimiento explícito de comprador + finalistas, cifra AES-GCM/HMAC de chat, política de permisos y reserva a lo sumo una vez.

**No usar** una fecha retroactiva al habilitar el piloto real. Los tests usan `activated_at = now()-5 days` estrictamente para recorrer solicitudes ficticias creadas cuatro días antes, dentro de una transacción con `ROLLBACK`; nunca es un procedimiento de producción. En uso real, activar con el reloj **actual**, sin modificar fechas de solicitudes históricas.

## Pruebas realmente ejecutadas

En Supabase PostgreSQL 17 del entorno piloto se ejecutaron en dos transacciones **sin persistir nada** las migraciones MVP101–110 ya desarrolladas con este guardia, más:
- `mvp110_smoke_rollback.sql`: apagado impide cola/plan, activado ahora impide antiguas rondas, escenario ficticio de consentimiento/preparación/lease/llamadas simuladas, desactivado impide claims y revelación. Respuesta `reverted=true`. **PASS**.
- `mvp112_roundtrip_e2e_rollback.sql`: mismo comprador y dos proveedores sintéticos hasta proyección anónima, cierre de 96 h, cobertura completa y parcial, opt-in, outbox 3 o 2 avisos, revocación del enlace, ahora bajo activación ficticia controlada. Respuesta `reverted=true`. **PASS**.

Pruebas unitarias `tests/unit/mvp113-finalist-launch-guard.test.mjs` cubren contrato de salida, controles de código, exclusión de históricas, protección de contacto/claim. CI GitHub debe validarse en HEAD antes de fusionar.

## Preparación comercial: NO_GO

No existe versión definitiva desplegada: la base actual seguía sin 12 componentes funcionales nuevos, Whapi/seguimiento Edge seguían en versiones anteriores y el worker de finalistas no existía en el entorno piloto. `supabase/piloto/mvp112_readiness_readonly.sql` agrega esta **13.ª puerta**; aunque todas las tablas estuvieran instaladas, la activación queda apagada por defecto. **No confundir instalación con permiso de enviar.**

Siguen pendientes revisión y aceptación de PDF/fotos con cotejo de fuente (no basta doble IA), Excel/Word complejos, políticas de tamaño/documentos completos, ranking económico IVA/flete/pagos y hasta dos proveedores, integración del stack de PRs, despliegue **solo PILOTO** bajo orden `Publicalo` y prueba por tres teléfonos reales con consentimientos/entrega. No existe intención de envío hasta que el operador lo autorice específicamente.

## Checklist antes de liberar avisos finales

- [ ] Respaldo/restore PILOTO y control de costos revisados
- [ ] Migraciones y Edge actuales comprobadas contra commit exacto
- [ ] Archivos PDF/foto e ítems complejos tratados sin pérdida ni publicación engañosa
- [ ] WhatsApp de prueba tres personas, alta, opt-in, canal/número correctos y respuestas/entrega reales
- [ ] Solo operador autorizado fija activación presente y enciende worker del entorno PILOTO
- [ ] Hacer ronda NUEVA posterior a la activación, no reutilizar una histórica
- [ ] Al cierre demostrar 1+2 avisos únicos y revocación; guardar logs sin teléfonos

**Resumen:** un test sintético reversible aprobado no implica que el producto esté funcionando por WhatsApp. Este guardia impide los primeros mensajes retroactivos cuando llegue el día de encenderlo.
