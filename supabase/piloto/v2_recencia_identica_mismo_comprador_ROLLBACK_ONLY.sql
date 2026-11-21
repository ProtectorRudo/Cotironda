-- ROLLBACK DE EMERGENCIA ÚNICAMENTE. NO PUBLICAR SIN «Publicalo».
-- Revierte solamente el nuevo RPC privado del desempate V2;
-- preserva correlación MVP291, originales, archivos y cualquier asociación ya hecha.
DROP FUNCTION IF EXISTS
 public.cotironda_piloto_auto_correlation_bind_latest_same_buyer_v2(text,text,text,uuid);
