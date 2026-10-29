# Cotironda

**Estado: Etapa 01 — identidad y catálogos en desarrollo. Vista preliminar publicada (sin licitaciones reales).**

Cotironda es una plataforma argentina B2B para solicitar cotizaciones privadas de **materiales de obra**. El comprador carga una lista una sola vez; la IA la interpreta y separa por rubro; el comprador revisa y confirma. Se invita a proveedores pertinentes según catálogo y cobertura geográfica; estos pueden responder desde WhatsApp (Whapi + IA) o por un portal opcional. El comprador compara ofertas anónimas, completas o parciales, y adjudica manualmente.

## Modelo
- Proveedores: **gratuitos, sin comisiones ni abonos**.
- Compradores: suscripción proyectada de **ARS 10.000/mes**, sujeta a validación económica; duración de prueba gratuita pendiente.
- Solicitudes ilimitadas con condiciones de uso razonable por definir. No se cobran comisiones por venta.
- MVP: Cotironda no compra materiales, no procesa pagos de esas compras ni garantiza su entrega.

## Invariantes
1. Revisión del pedido por el comprador antes de publicar.
2. IA interpreta; cálculos de precios y comparaciones son deterministas.
3. Cobertura y competitividad separadas; nunca enfrentar totales de canastas diferentes.
4. Identidad y contacto de oferentes protegidos durante la ronda y revelados según adjudicación.
5. Precio y modificaciones de oferta sujetos a confirmación del proveedor.
6. Proveedores seleccionados por productos realmente comercializados y zona, con consentimiento.
7. Publicación a producción solamente con autorización explícita.

## Documentación
- [Normas de trabajo](AGENTS.md).
- [Producto](docs/01-producto.md), [reglas](docs/02-reglas.md), [arquitectura](docs/03-arquitectura.md), [IA documental](docs/04-ia-documental.md).
- [WhatsApp](docs/05-whatsapp.md), [ranking](docs/06-ranking.md), [seguridad](docs/07-seguridad.md), [pruebas](docs/08-pruebas.md).
- [Roadmap](docs/09-roadmap.md), [decisiones](docs/10-decisiones.md), [costos](docs/11-costos.md), [modelo de datos](docs/12-modelo-datos.md), [operaciones](docs/13-operaciones.md).

## Método
Issue → alcance y aceptación → rama → implementación → pruebas/auditoría → PR → revisión → integración → despliegue autorizado.

> **Repositorio público por decisión del propietario.** No colocar aquí tokens, contraseñas, presupuestos reales, números de teléfono, datos personales, listas de clientes o información confidencial. Este material inicial es de diseño, no código funcional.

> Desarrollo de Etapa 01 en rama: esquema SQL declarativo en `supabase/schema.sql`, selector en `src/domain/elegibilidad.ts` y pruebas. **No se ha aplicado ninguna migración real.**

**Vista preliminar pública:** https://cotironda.vercel.app — sitio demostrativo con datos ficticios, aislado de Viralio. **Pruebas reales SQL/RLS:** `.github/workflows/postgres-rls.yml` sobre PostgreSQL efímero de GitHub Actions. No hay Supabase Cotironda en la nube.

## Etapa 01 — Portal de registro (rama de desarrollo)
- Se creó `apps/portal` (Next.js 16, React 19, Supabase SSR) con ingreso, alta de empresa y ruta POST protegida; **sin datos reales ni registro habilitado**.
- SQL: registro atómico/idempotente y límite provisional de 5 empresas nuevas por usuario/24h, serializado bajo lock; SQL/RLS probados contra PostgreSQL 17 efímero.
- **Evidencia:** 64/64 tests unitarios (https://github.com/ProtectorRudo/Cotironda/actions/runs/40858591761), PostgreSQL 17 (https://github.com/ProtectorRudo/Cotironda/actions/runs/40858590551), build Next.js (https://github.com/ProtectorRudo/Cotironda/actions/runs/40858590465).
- Las dependencias tienen versiones fijadas y `package-lock.json` generado y guardado por GitHub Actions.
- **La migración inicial se aplicó y verificó en `cotironda-dev`; el portal sigue sin Auth real ni registros habilitados**. La demo de `cotironda.vercel.app` se mantiene sin cambios.

## Desarrollo: Supabase dedicado
Proyecto de desarrollo: `cotironda-dev` (`qkercsoqhehbenbbncwk`), versión de migración `20261029105736`. RLS y registro SQL verificados directamente en Supabase con datos sintéticos revertidos. Ver [registro de verificación](docs/19-supabase-dev.md). Este entorno no debe usarse para cotizaciones reales.

**Seguridad del registro:** existe segunda migración `20261029111731_backend_role_limited` aplicada en Supabase dev, con rol de backend NOLOGIN y sin bypass RLS. El portal sigue cerrado: falta credencial de backend y sesión de Auth validada E2E.

**Auditoría actual:** la tercera migración de Etapa 01 (`20261029112947_execute_only_registration`) deja al rol del backend sin permisos de inserción directos. Únicamente invoca la función privada auditada; falta autenticar el origen de `p_user_id` y habilitar conexión de servicio segura. Ver `docs/21-funcion-registro-privilegios.md`.

**Registro por JWT (desarrollo):** cuarta migración `20261029120021_jwt_bound_registration_locked` aplicada en `cotironda-dev`. El portal y la base tienen interruptores independientes apagados. Sin conexión PostgreSQL directa. La advertencia de SECURITY DEFINER pública fue corregida por la quinta migración; faltan hook Auth activado y E2E JWT real. Ver [auditoría](docs/22-jwt-registro.md).

**Actualización de seguridad (PR #18):** la quinta migración `20261029122708_invoker_verified_email_hook` eliminó la alerta WARN del Security Advisor. RPC pública `SECURITY INVOKER`, función privilegiada en esquema privado y chequeo de correo mediante claim firmado por un Auth Hook aún **sin activar**. Registro cerrado en web y base. Ver [auditoría actual](docs/23-hook-correo-auditoria.md).

**Pruebas E2E de Auth (PR #20):** preparado un runner manual para JWT auténticos y sesión Supabase (sin crear usuarios ni empresas) con validación estricta de que se usa solamente `cotironda-dev`. Nueve pruebas de preflight automáticas; E2E auténtico pendiente porque el Auth Hook aún no está habilitado. Ver [protocolo de activación y rollback](docs/24-auth-e2e-seguridad.md).

**Prueba adversarial del JWT (PR #22):** se preparó un test contra PostgREST que altera el sujeto de un JWT sin volver a firmarlo, y exige rechazo explícito por autenticación. Los tests automáticos son sin red; el E2E auténtico sigue pendiente de activar Auth Hook en desarrollo. Ver [auditoría JWT](docs/25-jwt-adversarial-auditoria.md).

**Auditoría de sesiones (PR #24):** sexta migración aplicada en `cotironda-dev`: valida sesión activa y estado actual del usuario en Auth antes de registrar, aun con JWT válido. Cierre de sesión/revocación, suspensión y eliminación bloquean nuevas altas. Los registros siguen deshabilitados y falta E2E real. Ver [sesiones vigentes](docs/26-sesiones-vigentes.md).

**Auditoría del portal (Etapa 01):** guard de Supabase fijado a `cotironda-dev`; la ruta real de alta responde 503 sin limitador durable. Registros web/SQL siguen apagados. Ver [revisión](docs/27-aislamiento-y-limites.md).
