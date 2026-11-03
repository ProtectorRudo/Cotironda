# MVP-121 — corte de Supabase PILOTO sin respaldo, autorizado expresamente

**Fecha:** 03/11/2026 · **Issue:** #453 · **Entorno:** Supabase PILOTO `ilggkalaafhtiysyzlmg`. No se publicó la versión comercial ni se modificó producción.

## Excepción operativa autorizada

El usuario indicó expresamente: **«Hacelo sin respaldo»**. Esta excepción modifica el requisito de backup previo en docs/237 y docs/239 **solo para este corte PILOTO**, no crea una autorización general para otros entornos. Se informó que el proyecto ya contenía 3 participantes, 2 invitaciones y 2 objetos Storage privados. El riesgo aceptado es que, ante corrupción, borrado o fallo irreversible, **no existe garantía de recuperación desde un respaldo externo**. Ningún original se ha copiado al repositorio, al chat ni a una ubicación pública.

## Instalación y evidencia

- Commit de código congelado: `e9ccc0069ca6bd772c9352dc6d7f5d3ef1a7b037`. Verificaciones de GitHub **7/7 PASS**.
- Se confirmaron 3 participantes opt-in (1 comprador, 2 proveedores), 0 mensajes pendientes en outbox y 2 objetos privados de Storage.
- Se pausaron temporalmente WhatsApp inbound/outbound y se aplicó exclusivamente al proyecto PILOTO la migración `mvp120_pilot_cutover_101_to_119_frozen_e9ccc006` con **15 archivos SQL**: ampliación a 25 productos, ledger de fuente y datos económicos, doble lectura, proyección anónima, coberturas, contactos cifrados, consentimientos, worker finalista y estados de entrega.
- Supabase devolvió **success:true**. Gate SQL `mvp112_readiness_readonly.sql`: **0 componentes faltantes**. La constraint documental indica 1–25 materiales.
- Se desplegó `cotironda-piloto-whapi` **v34** y `cotironda-piloto-finalistas` **v1**. El guardia `finalist_activation_mvp113.enabled=false` permanece desactivado (y `activated_at=null`) para impedir envíos a rondas antiguas.
- La actualización de `cotironda-piloto-seguimiento` fue **bloqueada por controles de seguridad de la herramienta**, por lo que sigue **v7**. No se sorteó el bloqueo.
- Se ejecutaron dentro de una transacción cuatro ensayos SQL contra el esquema ya instalado: MVP112 ronda 1+2; MVP115 parciales; MVP117 9/25 materiales; MVP119 estados de entrega. **PASS + ROLLBACK**, y los dos originales privados siguieron presentes.
- Se reactivaron las banderas DB de WhatsApp inbound/outbound para los tres participantes autorizados. Se verificó `missing_database_gates=0` y el estado declarado por SQL `database_gates_present_external_edge_and_real_e2e_not_verified`.
- Se publicó Vercel Preview `cotironda-portal-dev` (mismo commit congelado), despliegue `dpl_5QfqLSoqfDpJcN43Q72gaCxvmudC`, estado READY, rutas `/`, `/probar/whatsapp` y `/probar/tres-telefonos` HTTP 200. Esas rutas siguen siendo **simulaciones**, no el tablero vivo completo.

## Qué NO está acreditado

1. No se verificó la configuración real del webhook Whapi para `statuses.post`, ni se pudo acreditar una entrega `delivered` en tres teléfonos; `sent:true` no significa entrega.
2. La vista de seguimiento instalada es v7 y no incorpora la nueva implementación del PR integrador; no se puede prometer visualización en vivo de precios aprobados durante la ronda.
3. No se han vinculado aún contactos cifrados (`participant_channels_mvp109`: 0) ni consentimientos específicos de revelación (`contact_reveal_consents_mvp109`: 0). Los mensajes de finalistas no pueden encenderse hasta cumplir ambas cosas.
4. El comparador económico exacto sigue **offline** para presupuestos reales mientras falte corroborar IVA, flete, mínimos, pago, disponibilidad, extras y total contra la fuente.
5. PDFs complejos, escaneos e imágenes no tienen reconocimiento y cotejo universal. Una fuente no verificada permanece privada o en revisión; no se improvisan precios.

**Resultado correcto:** base de PILOTO instalada, funciones parcialmente actualizadas, entrada/salida habilitadas para participantes de prueba; **NO-GO para declarar el circuito comercial completo** hasta verificar seguimiento, entrega y ronda real 1+2. La producción institucional se preservó.
