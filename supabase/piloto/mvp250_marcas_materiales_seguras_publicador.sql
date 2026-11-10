-- MVP250: conocidas marcas comerciales de materiales, no nombres de proveedores.
-- Solo permite una marca de material delante de un rubro conocido;
-- el guard anti-PII y todas las verificaciones del MVP248 permanecen activos.
-- Desconocidos -> revisión privada, no exposición por coincidencia de IA.
-- Reaplicar este helper después de la migración MVP248, PILOTO únicamente.
CREATE OR REPLACE FUNCTION
 cotironda_piloto_privado.descripcion_comercial_publicable_mvp248(
 p_descripcion text
) RETURNS boolean
 LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path TO ''
AS $safe$
 SELECT p_descripcion IS NOT NULL
  AND length(btrim(p_descripcion)) BETWEEN 2 AND 180
  AND p_descripcion ~* '^([0-9]{1,4}[[:space:]]+((bolsas?|bolsones?|unidades?|latas?|envases?|packs?|cajas?|metros?|mts?|litros?|kg|m2|m3)[[:space:]]+(de[[:space:]]+)?)?)?(?:(?:sinteplast|avellaneda|alba|tersuave|weber|sika|knauf|durlock|klaukol|loma[[:space:]-]?negra|sherwin[[:space:]-]?williams|petrilac|tigre|fv|ferrum|peisa|genrod|schneider|cambre|kalop|prysmian|acindar|mapei|barbieri|aislantes[[:space:]-]?isover)[[:space:]]+)?(cemento|arena|piedras?|ladrillos?|bloques?|hormig[oó]n|mortero|mezcla|cal|hierros?|varillas?|mallas?|alambres?|clavos?|membranas?|impermeabilizantes?|hidr[oó]fugos?|ceresita|ligantes?|pinturas?|l[aá]tex|esmaltes?|fijadores?|sellador(?:es)?|rodillos?|pincel(?:es)?|diluyentes?|enduido|enduidos|cables?|conductor(?:es)?|disyuntor(?:es)?|t[eé]rmicas?|t[eé]rmicos?|interruptor(?:es)?|tomacorrientes?|tomas?|enchufes?|llaves?|cajas?|ca[nñ]os?|tubos?|codos?|uniones?|conectores?|conductos?|canaletas?|fusibles?|contactor(?:es)?|placas?|durlock|yeso|masilla|cintas?|perfiles?|montantes?|soleras?|aislantes?|lana|tornillos?|tarugos?|arandelas?|tuercas?|bulones?|baches?|grifer[ií]a|sanitarios?|inodoros?|bidets?|bachas?|piletas?|lavatorios?|sifones?|v[aá]lvulas?|tanques?|bombas?|mangueras?|flexibles?|pvc|ppr|siliconas?|pegamentos?|adhesivos?|sellador(?:es)?|pallets?|bolsones?|bols[oó]n|big[[:space:]-]?bag|fletes?|env[ií]os?|transporte|descuentos?|bonificaci[oó]n|bonificaciones|recargos?|iva|impuestos?|envases?|embalajes?)([[:space:]:,.(/-]|$)'
  AND p_descripcion !~* '(https?://|www[.]|wa[.]me|@[[:alnum:]_]|cuit|cuil|tel[eé]fono|whatsapp|celular|direcci[oó]n|domicilio|contacto|raz[oó]n[[:space:]]+social|[[:alnum:]_.%+-]+@[[:alnum:].-]+|[0-9]{8,}|(^|[^[:alpha:]])(s[.]?r[.]?l[.]?|s[.]?a[.]?s?|sociedad|empresa|proveedor)([[:space:][:punct:]]|$)|corral[oó]n|pinturer[ií]a)'
  AND p_descripcion !~ '[\r\n\t]'
$safe$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.descripcion_comercial_publicable_mvp248(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 cotironda_piloto_privado.descripcion_comercial_publicable_mvp248(text)
 TO service_role;

