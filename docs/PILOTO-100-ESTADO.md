# Cotironda V2 — Estado REAL del piloto

**Relevamiento:** 14/11/2026. **No terminado.** Este documento es el relevo corto, no un registro acumulativo. Ante otra conversación, confirmar fuentes activas antes de continuar.

**Último control real — 14/11/2026 06:30 ART.** **Vercel** rechazó publicación EXACTA f985 del Preview `cotironda-portal-dev` con HTTP **402** (`api-deployments-free-per-day`, reintento recomendado 86.400 segundos). **NO hubo deployment**, no cambiar de proyecto ni aumentar plan; existe UN reintento ya programado 14/11 17:07 ART que debe comprobar cuota/estado antes de actuar. **Supabase**: 7 rondas, pero cron heredado `cotironda_piloto_close_due_5min` cerró la única `prepared` a las **06:25 ART** del 14/11: ahora **5 cerradas, 2 borradores, 0 preparadas**. V2 negocio/originales/cierre/términos continúan **OFF**; 0 consentimientos originales, 0 avisos; 0 mensajes nuevos en `whapi_outbox` (último envío histórico 03/11), 0 `finalist_whapi_outbox_mvp110`. Hay 1 comprador y 2 proveedores WhatsApp consentidos, **106 productos en catálogos de 2 proveedores**: 86 `curated_family`, 20 `pending_review`; **0 proveedores con `catalogue_confirmed_at`**. Antes de una nueva ronda validar matching por producto y la disponibilidad real del catálogo, sin dar por confirmadas esas 106 líneas. Se necesita clave Supabase `sb_secret_` server-only para Preview; HMAC ya configurada.



## ÚNICA PRÓXIMA ACCIÓN
**Desbloquear la credencial privada de Supabase para el portal Preview:** la variable de Vercel `COTIRONDA_PILOT_SUPABASE_SECRET_KEY` está **AUSENTE**. Debe contener una clave `sb_secret_...` del proyecto **`cotironda-piloto`** y configurarse exclusivamente en servidor, entorno **Preview**, sin compartir valor por chat/GitHub. El conector Supabase actual solo entrega publishable keys: NO simularla con una pública ni imprimir secretos. Es la única intervención externa indispensable para avanzar con acceso real; la persona titular puede hacerlo desde paneles seguros de Supabase/Vercel.

**Mientras no exista:** seguir solo tareas sin envíos, sin alterar políticas ni producción; verificar el despliegue UI previsto, preparar integración y pruebas de WhatsApp, no reabrir arquitectura V1.

## Foto verificada

| Componente | Estado comprobado |
| --- | --- |
| GitHub | `ProtectorRudo/Cotironda`; [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794). V2 canónica en rama `docs/cotironda-v2-unica-direccion-20261112`. |
| Supabase | Proyecto piloto `ilggkalaafhtiysyzlmg`, PG17; 7 rondas históricas, **5 cerradas y 2 borradores** a 14/11 06:30 ART (cron V1 cerró la que estaba `prepared`); **no alterar**. |
| Políticas V2 | Negocio, originales, cierre y términos de proveedor: **OFF**. 0 consentimientos de originales, 0 avisos de alta. |
| Whapi | `cotironda-piloto-whapi` Edge **v76** en servicio; puente V2 D016 es candidato no desplegado. No reemplazar v76 sin diff, pruebas y rollback. |
| Vercel | Proyecto `cotironda-portal-dev` `prj_d13rTHxJADvP2K9PcrM0CJQD9Zok`, SSO protegido. Último READY `dpl_DZkYMAzzVbZitq4Dz1NwyYN7Yued` SHA `64b8573` **no es V2 UI aprobada**. |
| Interfaz nueva | PR [#837](https://github.com/ProtectorRudo/Cotironda/pull/837) SHA EXACTO `f98527c9516478783bd7cf95433c58f5ca445937`, pendiente de Preview. **Un único reintento** programado 14/11/2026 17:07 ART; no duplicar ni cambiar SHA. |
| HMAC privado | `COTIRONDA_D016_HMAC_KEY_HEX` creada de 32 bytes aleatorios y verificada en Vercel Preview, `encrypted`. No rotar inadvertidamente; el Edge debe compartirla de forma segura. |
| Acceso D016 | Vercel `COTIRONDA_D016_ENABLED=false`, texto y análisis D016 también false. Falta `COTIRONDA_PILOT_SUPABASE_SECRET_KEY` y alinear origen del portal con Preview real. |
| Consentimiento V2 | Alta única de proveedores en [#846](https://github.com/ProtectorRudo/Cotironda/pull/846), términos aún sin texto aprobado, sin aceptaciones. Guard de baja/reaceptación publicado en piloto migración `20261114053740`, PR [#849](https://github.com/ProtectorRudo/Cotironda/pull/849), PG17 probado. |
| Prueba integral | **NO PASÓ:** falta pedido real nuevo → matching por catálogo → respuestas de dos proveedores → originales descargables autorizados → análisis → informe/cierre por navegador. |

## Reglas que NO deben cambiar
V2 = compradores por WhatsApp, catálogo por **producto y zona**, proveedores libres por WhatsApp, originales íntegros, portal privado con **solo proveedores que respondieron identificados**, análisis individual y final, dos días hábiles con cierre 18:00 Argentina. Sin ranking vivo, dos ganadores obligatorios ni anonimato V1. La identidad del comprador y contactos protegidos. No inventar IVA, flete o precios. No consentimiento de originales inferido por cotizar.

## Próximo paso después de la clave
Verificar Preview f985 READY + SSO + flags y origen; integrar la misma HMAC en Edge con custodia; aprobar términos prospectivos de originales una sola vez (revisar jurídicamente); ensayar E2E con comprador + Ailín/Nahuel, con consentimiento documentado y sin manipular rondas históricas. Activar comercialmente SOLO después de comprobar permisos, coste y duplicados.

**Evidencia anterior íntegra:** [Estado antes de compactar](https://github.com/ProtectorRudo/Cotironda/blob/7ea6863deb38415a518d5c80788d5210a9fca75e/docs/PILOTO-100-ESTADO.md) (historial inmutable Git). No reproducir aquí bitácoras viejas. [Plan corto](PILOTO-100-PLAN-MAESTRO.md) · [Contrato](COTIRONDA-V2-CONTRATO.md).
