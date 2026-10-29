# Cotironda

**Estado: Etapa 00 — documentación para revisión. No hay producto desplegado.**

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
