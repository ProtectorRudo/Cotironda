# Corte controlado del PILOTO — auditoría integrada de preparación (MVP-118)

**02/11/2026. Estado real: NO_GO.** No es una autorización de despliegue y no registra ninguna prueba WhatsApp real.

## Fuentes inspeccionadas y versión exacta

- GitHub `ProtectorRudo/Cotironda`, rama `feat/mvp-118-comparador-economico-25-mitm`, PR integrador #448 sobre `integration/mvp-piloto-20261031`. Incluye por ancestro las implementaciones MVP101–118 y el parche incremental MVP117 de 25 materiales. La rama aún es **DRAFT** y no está fusionada.
- Supabase proyecto aislado `ilggkalaafhtiysyzlmg`: la base instalada seguía devolviendo **NO_GO, 13 puertas ausentes** al consultar `mvp112_readiness_readonly.sql`; WhatsApp IN/OUT y archivo de medios están **habilitados en las banderas DB**, lo cual no prueba existencia de worker actualizado ni entrega real.
- Supabase Edge instaladas (consulta de metadatos, solo lectura): `cotironda-piloto-whapi` **v33**, `cotironda-piloto-seguimiento` **v7**. No figuraba `cotironda-piloto-finalistas` desplegada.
- Vercel `cotironda-portal-dev`: último deployment consultado figura `READY`, pero no es la rama integradora PR #448. Proyecto **no marcado live**, protegido por SSO y con dominios **vercel.app de DEV**; este hecho NO demuestra que el enlace de seguimiento actual use el diseño de GitHub. Variables de Vercel revisadas por **nombres solamente**, sin descifrarlas, y no prueban que las secrets Edge de Supabase o Whapi estén presentes o sean correctas.
- Se consultó información pública actual de Supabase sobre TLS: hay un cambio anunciado para el **10/11/2026** que afecta únicamente clientes con suites TLS 1.2 CBC antiguas; no se detectó aquí evidencia de incompatibilidad, pero se debe validar al probar Whapi/Edge. No asumir entornos sin auditar.

## Ensayo combinado reproducible: 13 puertas RLS y 25 artículos

Una **sola transacción** PostgreSQL17 del proyecto PILOTO incluyó, en ese orden:

1. `supabase/piloto/mvp117_upgrade_document_25.sql` (actualización del contrato de documento ya instalado).
2. Scripts SQL MVP101, 102, 103, 104, 105, 106, 107 proyección, 107 tracking, 108, 109, 110 cola y 110 buyer tracking, tomados de la misma rama GitHub.
3. `supabase/piloto/mvp118_release_db_gate.sql` (inert, solo lectura), que **falla** si falta un componente privado, si se ve un dato privado por `anon`/`authenticated`/directamente `service_role`, falta RLS, hay RPC ejecutable por rol anónimo, el guardia de finalistas ya está activo o no se aplicó el check 1–25.
4. `ROLLBACK` y verificación posterior explícita de que la tabla privada de activación no existe y el check anterior de ocho continúa instalado.

Resultado de ejecución: **PASS — `all_rolled_back=true`, `previous_limit_kept=true`**. No se enviaron mensajes, se instalaron migraciones ni se modificaron archivos originales. Esto confirma **compatibilidad transaccional de esas piezas en la base piloto actual**, NO que las funciones Edge reales ni la comparación comercial de todas las condiciones estén verificadas.

Por separado, se ensayó también el recorrido PostgreSQL 1 arquitecto + 2 negocios, anónimo, cierre, consentimiento, avisos SIMULADOS, y pedidos de 9 y 25 artículos con rollback (docs/235).

## Secuencia exigida antes de instalar en PILOTO real

1. **Congelar commit y entorno exactos.** Revisar PR integrador, permisos de GitHub, CI completo y AGENTS.md. No usar automáticamente una nueva punta de rama como release sin revisar.
2. **Respaldo y reversión.** Guardar copia lógica protegida de base piloto + archivos privados y validar restauración en laboratorio separado. En la edición Free no presumir backups automáticos; la estrategia de vuelta atrás tras admitir nuevas solicitudes puede ser apagar el worker/flags en lugar de borrar tablas con datos.
3. **Presupuesto y seguridad:** comprobar límites por teléfono/cliente, consentimiento, whitelist de tres participantes, costo de IA y Whapi, claves HMAC/AES, versión de secretos en Edge. Si un token se compartió o expuso, **rotarlo** en el proveedor; no copiarlo a GitHub/ChatGPT ni imprimirlo.
4. **Aplicar scripts con orden controlado**, tabla de migraciones y auditoría de RLS. No alterar `production`; usar solo `ilggkalaafhtiysyzlmg` cuando la orden específica sea `Publicalo: PILOTO`.
5. **Desplegar funciones Edge exactas y de manera coordinada**: Whapi, seguimiento y finalistas; comprobar hashes/versión efectiva, permisos, callback, headers secretos y funcionamiento de prueba. La mera bandera DB `whatsapp_outbound_enabled=true` no basta.
6. **Vercel PREVIEW**: compilar desde commit aprobado, verificar link privado, hash del artefacto y aislamiento del token en fragmento URL. No conectar todavía dominio público si no está autorizado.
7. **Mantener avisos finalistas apagados** hasta aprobación específica. Al habilitarlos, fijar `finalist_activation_mvp113.activated_at` al momento actual y después de comprobar que las tres personas autorizaron contactar; nunca elegir una fecha retroactiva para enviar rondas históricas.
8. **Prueba externa 1+2**: un arquitecto envía texto libre (con y sin zona), archivos diferentes; dos negocios reciben únicamente subconjuntos en PDF, responden con sus originales y cargos extra; comprobar fuente, importes, token anónimo en vivo, cierre 96h, 3 avisos idempotentes, opt-out y recepción **efectiva** en Whapi (no solo HTTP 200).
9. **Economía real**: no anunciar ranking de mejores precios ni adjudicación hasta que IVA, flete, embalajes, pago, disponibilidad, descuentos y equivalencias queden expresamente capturados **y cotejados contra el original**. El comparador offline MVP118 ya calcula 25 ítems, pero **no está conectado a originales económicos suficientemente estructurados**. Si no son comparables, mostrar solo cobertura con explicación honesta.

## Criterios NO-GO que permanecen

- 13 controles privados aún ausentes de la base instalada y worker de finalistas Edge ausente.
- Lectura automática universal de fotografías/escaneos, PDF complejos o Excel con fórmulas, más de 25 renglones o 3 MiB **sin perder ninguna línea**.
- Contrato estructurado y verificable para IVA/flete/descuentos/pagos que habilite ranking económico real; el comparador nuevo es offline.
- Entrega/confirmación real mediante Whapi y UI correcta en teléfonos de las tres personas.

**Conclusión operativa:** hay una versión de desarrollo más fuerte y una ruta de instalación reversible probada, pero sigue prohibido declarar el piloto **GO**. El usuario recibirá aviso solamente tras la prueba real autorizada y satisfactoria.
