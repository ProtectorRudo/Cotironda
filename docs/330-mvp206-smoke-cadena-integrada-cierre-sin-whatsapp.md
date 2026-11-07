# MVP206 — prueba integral del cierre de ronda y seguimiento, sin WhatsApp

**Alcance:** CI en desarrollo. No se instala SQL, no modifica Vercel o
Supabase, no revela datos, no descarga originales, no envia WhatsApp
ni se publica en producción o PILOTO.

## Por qué
En el checklist #529, la primera ronda de extremo a extremo sigue abierta.
Existían pruebas unitarias individuales de los servicios de fuente v9 y
del proxy/navegador, pero faltaba una regresión **realmente conectada**
con datos de las dos rondas anonimizadas del piloto.

## Cadena ejercitada por un único test

1. Carga la fixture anonimizada MVP199 (2 solicitudes, 4 documentos v9,
   10 renglones reales en estructura, hashes ficticios y sin identidad).
2. Las mismas funciones de dominio que usa el Edge derivan
   `MVP175 → MVP180 → MVP186 → MVP194 / MVP189 / MVP204` de **un mismo
   sobre de fuente**. Conserva texto público aprobado y verifica que
   orden HMAC y orden visual son independientes.
3. El `buyerView` **real** de Vercel procesa esos datos, aplica
   allowlist y deriva sugerencias de cobertura MVP203.
4. El `site.js` **real** renderiza los dos presupuestos y los paneles;
   sin biblioteca duplicada de componentes ni HTML inyectable.
5. Prueba revocación de token, caída de red, estado abierto,
   documento v8, SHA cruzado, localizador de descuento alterado y
   proyección comercial manipulada, sin revelar información parcial.

## Criterios de aceptación
- Las dos rondas producen todas las proyecciones, pero sin
  `ranking_allowed`, descarga, contacto ni adjudicación.
- El proxy nunca devuelve HMAC, SHA ni request ID de las fuentes.
- Las ofertas parciales no desaparecen, sin importar orden.
- Un intento de falsificar moneda o cobertura numérica oculta ese
  panel sin romper los presupuestos anónimos válidos.
- Un token revocado o fallo HTTP limpia la información privada visible.

## Lo que **NO** acredita

Esto es una **prueba de contrato integrada con fuentes anonimizadas**:
no realiza conexión en vivo a Supabase PILOTO, acceso Auth del comprador,
descargas reales, Whapi/telefonía, cierre cron ni restauración de backups.
No sustituye la prueba final de tres teléfonos ni permite marcar
P0-G como terminado. Solo deja una barrera CI reproducible para no
regresar en las piezas ya existentes. #529/#528/#535 permanecen abiertos.
