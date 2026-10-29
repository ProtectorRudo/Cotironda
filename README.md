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

**Registro por JWT (desarrollo):** cuarta migración `20261029120021_jwt_bound_registration_locked` aplicada en `cotironda-dev`. El portal y la base tienen interruptores independientes apagados. Sin conexión PostgreSQL directa. Sigue abierta una advertencia de SECURITY DEFINER y faltan pruebas JWT reales. Ver [auditoría](docs/22-jwt-registro.md).
