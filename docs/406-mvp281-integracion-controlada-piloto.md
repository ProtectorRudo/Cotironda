# Decisión 406 — MVP281: preparar integración sin publicar el piloto

Fecha: 06/11/2026 (Argentina). Autorización: **Luz verde, solo desarrollo**. Issue #663.

## Estado comprobado, no supuesto

- PR #662, commit `491f1e04`, fusionado a **`feat/mvp174-supplier-packaging-equivalence`**. `main` es otra rama; no equivale a publicación.
- Supabase `cotironda-piloto`: PostgreSQL 17.11 activo; 71 migraciones registradas; la última es MVP239. No estaban instalados el medidor de costos MVP264 ni los tres componentes clave de aprobación MVP278–280.
- Consultas SQL de solo lectura: IA Central OFF, despacho OFF, prueba temporal OFF y compartir originales OFF; 0 despachos inciertos.
- Cron existentes, todos cada 5 minutos: `cotironda_piloto_close_due_5min`, `cotironda_piloto_document_recovery_5min`, `cotironda_piloto_ia_central_reconcile_mvp230`. Ninguno fue creado/activado por esta tarea.
- Workflow PR #662: Node, Deno, PostgreSQL17 y Next build reportados exitosos. Chequeos externos Vercel fallan por límite de compilaciones de la cuenta: **no** es un error demostrado de TypeScript, pero tampoco es verificación de despliegue real.

## Contrato para instalar más adelante

El manifiesto `scripts/piloto/mvp281-manifiesto-integracion.mjs` enumera **21 archivos SQL candidatos** desde MVP245 hasta MVP280 y verifica orden, nombres, duplicados y existencia. Ejecutarlo con `node scripts/piloto/mvp281-manifiesto-integracion.mjs --check` NO instala nada. **No es un plan SQL ejecutable automáticamente**: antes de aplicar migraciones, contrastar el esquema real, funciones existentes y compatibilidad con todos los cambios que puedan haberse instalado bajo nombres de migración consolidados.

Quedan EXCLUIDOS de la instalación automática los `*_MANUAL.sql` (incluido el cron MVP263), scripts de rollback, pruebas/smoke y `mvp268_launch_readiness_readonly.sql`. El archivo `scripts/piloto/mvp281-preflight-readonly.sql` es solo una consulta y nunca una migración.

### Pasos obligatorios para un futuro «Publicalo» en cotironda-piloto

1. Verificar nombre/ID del proyecto, rama/commit elegidos y respaldo recuperable. El respaldo pago continúa en Plan B; registrar explícitamente ese riesgo antes del corte.
2. Reejecutar ambos preflights SQL de solo lectura; resolver estados `uncertain`, comparar cron y comprobar gates OFF. Revisar RLS/ACL de las funciones privadas y el caso MFA de operadores.
3. Hacer ensayo en PostgreSQL 17 **aislado y con datos sintéticos** de los 21 SQL, en orden, sobre la estructura histórica del piloto. Luego realizar ensayo transaccional real `BEGIN ... ROLLBACK` solo con permiso de publicación y previa inspección de efectos no transaccionales. Jamás ejecutar el manifiesto como migración.
4. Con autorización `Publicalo`, instalar migraciones por fases y comprobar sus RPC y ACL, dejando gates de creación, publicación, envío, trial y operador OFF. **Primero SQL, luego Edge webhook compatible, después web/Vercel**; verificar la versión real con checks HTTP privados. No habilitar cron supervisor MVP263.
5. Revisar 4 interruptores nuevos de consentimiento: `COTIRONDA_PILOT_BUYER_REVIEW_REQUIRED_ENABLED`, `..._SEND_ENABLED`, `..._CONFIRM_ENABLED`, `..._RELEASE_ENABLED`, todos OFF al desplegar. Nunca activar rutas heredadas si falta aprobación de lista completa.
6. Recién con autorización separada para prueba real, probar WhatsApp desde el arquitecto hasta ambos proveedores: texto, TXT/CSV, PDF/DOCX/XLSX, aclaración de zona, revisión con código, PDF por rubro, presupuestos, ranking de cobertura/comparabilidad, cierre, revelación. Confirmar estados `api_accepted` versus entrega real, costos y no duplicados. Las imágenes no corroboradas y listas mayores a 25 ítems quedan bloqueadas; no degradar a una ruta insegura.

## Criterios de salida

- CI verde con integración sintética; versión de Edge/Vercel verificada; migraciones y ACL aplicadas correctamente; gastos bajo control.
- Sin exposición de nombres/contactos durante ronda; no comparar totales de ofertas parciales; precio, IVA y flete sustentados en fuente.
- Sin respaldos verificados ni E2E real, **no anunciar piloto comercial ilimitado**.

Este cambio genera preparación auditable, no declara publicada ni terminada la integración de las 7 etapas.
