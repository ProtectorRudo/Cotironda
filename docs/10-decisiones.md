# 10 — Registro de decisiones

Estados: **Aprobado**, **Propuesto**, **Pendiente**. Toda nueva decisión lleva ID, fecha, contexto, alternativas, resolución, impacto en reglas y pruebas.

## Aprobadas en conversaciones del proyecto
- D001 Nombre: **Cotironda**; confirmar disponibilidad de marca antes de inversión publicitaria.
- D002 Proveedores gratis y sin comisión.
- D003 Compradores con suscripción prevista de ARS 10.000/mes; validar monto y costos antes de lanzamiento.
- D004 (SUSTITUIDA por D013, 30/10/2026): la confirmación previa por línea queda anulada.
- D005 WhatsApp vía Whapi+IA como canal preferido de proveedores; portal alternativo.
- D006 Anonimato durante ronda, adjudicación humana y revelación de contactos según decisión.
- D007 Ranking separa cobertura, competitividad y costo completo. No enfrentar canastas diferentes.
- D008 Marcas flexibles salvo especificación obligatoria del comprador.
- D009 Evaluar compras completas con uno o hasta dos proveedores.
- D010 Desarrollo modular con auditoría, pruebas y GitHub como fuente oficial.
- D011 Repositorio inicialmente **público por instrucción del propietario (29-10-2026)**; prohibido incluir datos/secretos sensibles.
- D012 El propietario informó haber comprado **cotironda.com** en Hostinger (29-10-2026). El dominio pertenece a su registro; no equivale a aprobar publicación inmediata ni cambiar DNS.

## Propuestas pendientes de confirmar
- P001 Prueba gratis de 30 días y posible extensión si no hubo cotizaciones válidas.
- P002 Plazos configurables 24/48 horas, 3/5/7/10 días.
- P003 Invitaciones a 5–8 proveedores pertinentes por rubro (rotación y volumen a validar).
- P004 Comunicar a proveedores cobertura y competitividad sin puestos engañosos ni presión.
- P005 No procesar compra y pago de materiales desde Cotironda en MVP.
- P006 Tomar **www.cotironda.com** como host público canónico, redirigir apex a www y asociar ambos al proyecto público de Vercel `cotironda` (no portal-dev). Su implementación requiere autorización `Publicalo`, revisión DNS, SSL y rollback.

## Preguntas abiertas
- A001 Límites claros de uso razonable de pedidos «ilimitados».
- A002 Qué información de ofertas ve comprador antes del cierre.
- A003 Condiciones de equivalencia técnica, marcas y unidades.
- A004 Reglas concretas de garantía/calidad, vencimiento y reapertura.
- A005 Roles y autorizaciones para adjudicación, compras a varios proveedores.
- A006 Términos, privacidad, WhatsApp, política anti-spam.
- A007 IVA, precio de suscripción, prueba gratis, ajustes y pagos.
- A008 Cómo definir y medir objetivamente entrega/stock, filtros de confianza y reclamos.

No considerar ninguna propuesta automáticamente aprobada solo por estar documentada.

## D013 (APROBADA 30/10/2026): distribución automática selectiva
**Contexto:** el propietario corrige explícitamente D004. El diferencial comercial es cargar la lista UNA vez, no obligar a revisar un presupuesto reconstruido.
**Decisión:** el comprador autoriza distribución al enviar PDF, imagen, Excel, Word o texto. Cotironda extrae materiales y solicita cotizaciones automáticamente a cada proveedor únicamente por los productos de su catálogo confirmado y que entrega en la zona. Nunca basta el rubro; dudas/duplicados se retienen puntualmente y se notifican sin bloquear otras líneas. No hay aprobación previa por línea. Enviar una sola invitación idempotente por proveedor/ronda, con consentimiento y anti-spam. Confirmación de precios por proveedor y adjudicación humana permanecen. Issue #102.
**Impacto:** requiere corregir contrato documental, matching, avisos de cobertura y límites; una prueba offline no acredita envío real ni seguridad comercial.

## P007 — Política de alternativas de cotización (PROPUESTA TÉCNICA, pendiente aprobación comercial)
Issue #112/#113. El producto debe evitar descartar proveedores por presentaciones alternativas y nombres comerciales relacionados. Se propone separar **misma formulación/familia y atributos críticos verificados con distinta presentación** de **consulta funcional sujeta a ficha, uso y proveedor**, sin considerar ambas idénticas para comparar ranking. No convertir kg↔l ni CPC↔CPN, ni saltar marca obligatoria. El contrato puro se prueba en docs/70, **no se han autorizado mensajes reales ni homologación automática**. Quedan pendientes datos de catálogo auténticos, alias auditados, política de envío y UX de alternativas.

## D014 (APROBADA 30/10/2026): producto como esencia; marca y presentación como variantes
**Pedido del propietario:** Cotironda debe priorizar el producto y su función en obra, no excluir proveedores por marcas o presentaciones diferentes. **Resolución:** identificación del producto canónico → cotejo de especificaciones esenciales → flexibilidad de marca salvo exigencia explícita → cálculo transparente de presentación y excedente. Un proveedor con varias marcas aptas recibe una sola solicitud por ronda con opciones; comprador elige después, sin revisar cada línea antes de despachar. Si falta evidencia técnica, consulta sujeta a verificación; un atributo incompatible se excluye. IA sugiere; catálogos y equivalencias verificables se controlan mediante reglas/servidor. Prueba offline en Issue #115, docs/71. No aprueba aún política general P007 de equivalencias funcionales ni envíos reales.
