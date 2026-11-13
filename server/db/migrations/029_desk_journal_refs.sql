-- Журнал устройства: с каким товаром и тарой была операция.
--
-- Кирилл 13.11: «что за действие понятно, но с каким товаром нет». В строке
-- журнала было только «Упаковал, этикетка». Тело операции (`desk_ops.body`)
-- уже хранит товар, тару, заказ и отправление — функция отдаёт их узкой
-- выжимкой, а не всё тело: состав упаковки и споры журналу не нужны.
--
-- Тип результата меняется, поэтому функция пересоздаётся, а не заменяется.

DROP FUNCTION auth.desk_journal(text, integer);

CREATE FUNCTION auth.desk_journal(p_device text, p_limit integer)
RETURNS TABLE (at timestamptz, staff_ref text, kind text, status text, refs jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
  SELECT coalesce(o.happened_at, o.received_at), o.staff_ref, o.kind, o.status,
         jsonb_strip_nulls(jsonb_build_object(
           'productId', o.body->>'productId',
           'toteId', o.body->>'toteId',
           'boxId', o.body->>'boxId',
           'palletId', o.body->>'palletId',
           'orderId', o.body->>'orderId',
           'outboundCode', o.body->>'outboundCode',
           'code', o.body->>'code',
           'qty', o.body->'qty'
         ))
  FROM uklad.desk_ops o
  JOIN auth.desk_sessions d ON d.id = o.desk_id AND d.org_id = o.org_id
  WHERE uklad.current_org() IS NOT NULL
    AND o.org_id = uklad.current_org()
    AND d.device_ref = p_device
  ORDER BY 1 DESC
  LIMIT least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

REVOKE EXECUTE ON FUNCTION auth.desk_journal(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.desk_journal(text, integer) TO uklad_app;
