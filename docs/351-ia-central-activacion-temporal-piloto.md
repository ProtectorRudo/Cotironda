# ADR 351 — Activar IA Central en PILOTO con ventana corta, sin cambiar secretos

Fecha: 05/11/2026. Alcance único: Supabase `cotironda-piloto`, nunca producción.

## Por qué

Los PR #604–#607 conectaron el lector semántico y la vista de ofertas por
rubro, pero el webhook y el seguimiento condicionaban todo a variables de
entorno que los conectores existentes no pueden modificar en Supabase.
Además, habilitar varios flags globales sin ventana permitiría solicitudes
nuevas de forma indefinida, sin prueba Whapi real.

## Decisión MVP229

- Añadir `ai_trial_control_mvp229` privado, creado **OFF**.
  Activación manual con `enabled=true`, `activated_at` y `expires_at`.
  Validación SQL: **4 horas máximo**; al vencer, un RPC deja de autorizar
  nuevos análisis, invitaciones, vínculos y envíos, sin depender de un cron.
- Únicos participantes de la primera prueba: comprador `arquitecto` y
  proveedores `corralon_ailin`, `corralon_nahuel`, ya registrados
  consentidos y con catálogo en La Plata. Cualquier remitente nuevo
  devuelve `inactive`.
- `cotironda_piloto_ia_trial_flags_mvp229(chat_hmac)` es
  SECURITY DEFINER con ejecución exclusiva de `service_role`, sin
  teléfonos, secretos ni acceso de `anon` o `authenticated`.
- Doble gate para **crear rondas**: control de compra MVP226 y
  `whatsapp_inbound/outbound` existentes. Triple gate para **enviar
  PDFs**: control MVP226, control de despacho MVP222 y ensayo MVP229.
  La cola de despacho sigue usando locks/leases y recipientes HMAC.
- El webhook solo despierta el despachador después de que la fuente
  del comprador autenticado cree y publique una ronda. Un mensaje
  ajeno o una consulta no puede vaciar trabajos anteriores.
- Respuestas del proveedor sin `$` o con sinónimos siguen protegidas
  por el guard MVP228. En ventana, el vinculador mvp225 verifica
  identidad, ID Whapi y ronda antes del lector mvp227.
- La **vista privada de rubros** usa el token con ACL del RPC MVP227
  sin interrupción al vencer la ventana de prueba. Si se verificó
  una cotización, el comprador debe poder seguir viendo su información.

## Comprobaciones obligatorias antes de pasar a ON

1. CI Node, Deno y PG17 sin fallas; ensayo real Supabase dentro de
   `BEGIN/ROLLBACK`, 0 cambios históricos y sin envío Whapi.
2. Verificar proveedor permitido, desconocido bloqueado, fuente
   HMAC/SHA, derechos `service_role`, permisos explícitos, cuota
   y caducidad.
3. Verificar funciones Edge activas y su versión exacta antes de
   usar los nuevos gates, y que no haya mensajes legacy pendientes.
4. Al activar, usar ventana corta (90 minutos) en `cotironda-piloto`.
   No mostrar token ni contactos en chat, logs o PR.
5. Prueba humana completa: arquitecto manda lista con localidad,
   el PDF llega a ambos corralones, estos responden por texto/archivo,
   se visualizan dos ofertas correctamente por rubro en enlace privado.
   No confundir test SQL sintético con E2E real.

## Límites expresos

Aún no hay ingestión IA Central documental íntegra para Excel, Word,
PDF e imagen de ambos roles; no inventar lectura verificada de un
archivo cuyo SHA o texto no se recuperó. Tampoco está cerrado el
circuito completo de originales, adjudicación y avisos de cierre.
Si la API OpenAI no tiene credenciales/servicio disponible, la ronda
no debe enviarse. No afirmar terminado #529 ni #597 sin mensajes
reales y archivos reales. No tocar `main` ni producción.
