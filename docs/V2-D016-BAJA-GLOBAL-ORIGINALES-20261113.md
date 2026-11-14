# D016 / P0 — Baja GLOBAL de originales con «NO COMPARTIR»

**13/11/2026, Argentina — CANDIDATO.** SQL privado, misma RPC que Whapi ya invoca; **sin cambiar webhook v76 ni el portal**. PR #845 apilado sobre #844. No se envían mensajes, no se registra consentimiento nuevo y no se habilita ninguna política comercial.

## Hallazgo en el piloto real

En \`cotironda-piloto\`, \`public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(text,text)\` existía y verificaba el texto exacto por SHA en \`whapi_inbox\`, la identidad y el canal del proveedor. **Solo** insertaba una baja en \`v2_d016_original_notice_revocations\` por las rondas que ya tenían aviso. Sin un aviso/ronda, devolvía 0. La RPC **no** modificaba \`v2_supplier_original_consents.revoked_at\`, que es la autorización persistente que se utiliza al consultar originales de rondas futuras. Resultado potencial: un proveedor que escribió «NO COMPARTIR» podía seguir figurando como autorizado para nuevas rondas.

El riesgo se detectó por inspección de la definición SQL **real**. En el piloto todavía hay cero consentimientos explícitos de originales, cero avisos y cero bajas; por eso no se produjo una filtración observada. Aun así, impedir el fallo antes de abrir el piloto es imprescindible.

## Contrato funcional aprobado para el desarrollo

**Una sola baja debe tener efecto general.** El proveedor puede escribir «NO COMPARTIR» o «No compartir.» por el mismo WhatsApp registrado en Cotironda y **no necesita seleccionar una ronda**. Eso detiene las descargas nuevas y futuras de sus presupuestos originales; **no le da de baja comercial ni impide seguir cotizando**.

La RPC solo acepta mensajes de entrada archivados, de tipo \`text\`, remitidos desde el chat autenticado del proveedor; compara el SHA de uno de seis cuerpos exactos (combinaciones de mayúsculas/minúsculas y punto). No acepta identidades, números, texto ni hashes proporcionados por un navegador. El resultado se registra en una tabla privada append-only \`v2_d016_supplier_original_optout_events\` con PK del HMAC entrante y FK a \`whapi_inbox\`. El evento se registra incluso si no había una ronda ni un consentimiento previo.

La misma transacción:
- Fija \`revoked_at\` en la autorización única \`v2_supplier_original_consents\` **si esa autorización era anterior al mensaje**;
- Anota la baja de todas las rondas previamente avisadas al mismo proveedor y chat, sin duplicados;
- Registra la evidencia global y permite el resultado cero idempotente en los reintentos;
- Serializa, mediante la fila de proveedor bloqueada, la baja y los cambios de consentimiento. Un trigger protege la tabla de consentimientos contra la restauración retroactiva de una aceptación anterior a una baja. **Solo una aceptación nueva y posterior, jurídicamente válida, podría reactivar compartición para rondas nuevas.**

Esto mantiene los invariantes de \`original_evidence_status_private\`, \`responders_private\`, \`original_source_private\` y auditoría: proveedor sin consentimiento vigente no entrega originales, aun si tenía una sesión válida el comprador.

## Pruebas requeridas

Fixture \`supabase/tests/ci/v2-d016-global-original-optout-pg17.sql\` en PostgreSQL 17 con \`BEGIN/ROLLBACK\` y proveedores sintéticos:

- Mismo proveedor con aviso: evento global, revocación de consentimiento y de ronda; WhatsApp duplicado no hace nada.
- Proveedor sin aviso ni ronda: la baja **también** revoca el consentimiento para próximas invitaciones.
- Número/chat ajeno, cuerpo cualquiera y valores nulos: sin efectos.
- Intento de «resucitar» un consentimiento anterior: denegado por trigger.
- Consentimiento nuevo con fuente posterior: no revocado por reproducción de un mensaje viejo. Una baja nueva vuelve a revocarlo.
- RLS con accesos \`anon\`, \`authenticated\` y \`service_role\` directos denegados a la nueva tabla; RPC solo por \`service_role\`.
- La participación y el historial de ofertas del proveedor no se modifican.

Esta migración **no** implementa todavía el alta de consentimiento inicial, que requiere condiciones V2 informadas y un medio de aceptación expresa y documentada. El texto y fundamento para compartir información personal en originales requieren revisión jurídica acorde a Ley 25.326, artículos 5, 6 y 11. No equiparar automáticamente cotización con consentimiento.

## Publicación

Antes de instalar: preflight transaccional contra proyecto correcto, PG17, 7 rondas históricas/1 preparada, tres políticas OFF, 0 consentimientos originales/avisos/bajas y existencia de las funciones previas esperadas; verificar luego roles, 0 efectos retroactivos y la migración registrada. **No instalar** si CI específica falla. No activar Vercel, Whapi ni cron.

[PR #845](https://github.com/ProtectorRudo/Cotironda/pull/845) · [Issue #838](https://github.com/ProtectorRudo/Cotironda/issues/838) · [Plan maestro #794](https://github.com/ProtectorRudo/Cotironda/issues/794).
