# Cotironda · Seguimiento privado (PILOTO)

Proyecto Vercel aislado: `cotironda-seguimiento-vista-piloto`.
Directorio raíz de Vercel: `piloto/seguimiento-web`. No publicar `main` de Cotironda ni modificar su dominio.

- La página se renderiza desde Vercel porque Supabase Edge Functions devuelve `text/plain` para HTML.
- La API Vercel reenvía exclusivamente un `POST` a la función de seguimiento existente; nunca usa claves privadas ni guarda tokens.
- El acceso secreto llega en `#fragment`, y la redirección desde Supabase debe preservar ese fragmento sin transmitirlo al servidor GET.
- Los textos se insertan mediante `textContent`; precios y detalles solo si el RPC del comprador lo autoriza.
- La página y las pruebas de MVP146 deben pasar antes de activar el 302 del enlace viejo en el piloto.

Rollback: revertir solo el GET 302 de `cotironda-piloto-seguimiento` al código desplegado previamente; la API POST no cambia.
