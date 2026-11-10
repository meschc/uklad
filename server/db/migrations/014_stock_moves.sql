-- Журнал движений товара (шаг 2 переезда на таблицы).
--
-- Пока тара, короба отгрузки и размещения живут в снимке кабинета, сервер
-- при каждой записи снимка сравнивает «было» и «стало» и пишет сюда, в каком
-- месте сколько какого товара прибыло или убыло и кто это записал. Так у
-- каждой штуки появляется след: куда делось снятое с ячейки, кто вынул из
-- тары, когда короб похудел. Операции стола (шаг 3) будут писать сюда же
-- напрямую, а сравнение снимков уйдёт.
--
-- Журнал только дописывается: ни исправить, ни удалить запись приложение не
-- может.

CREATE TABLE uklad.stock_moves (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  -- Склад кабинета (id внутри снимка); у ячейки — пусто, её адрес и так
  -- принадлежит одному плану.
  warehouse_ref text CHECK (length(warehouse_ref) <= 100),
  -- Где: тара или паллетный короб (`box`), короб отгрузки (`outbound`),
  -- ячейка с товаром без тары (`cell`), тара на месте хранения (`box_at`,
  -- «адрес#тара»: перенос тары из ячейки в ячейку).
  place_kind text NOT NULL CHECK (place_kind IN ('box', 'outbound', 'cell', 'box_at')),
  place_ref text NOT NULL CHECK (length(place_ref) BETWEEN 1 AND 601),
  product_ref text NOT NULL CHECK (length(product_ref) BETWEEN 1 AND 100),
  -- Сколько прибыло (+) или убыло (−). У ячейки — +1 «положили», −1 «сняли»:
  -- размещение в кабинете не знает количества.
  delta integer NOT NULL CHECK (delta <> 0),
  -- Кто записал: руководитель из кабинета или стол со своим сотрудником.
  member_id uuid,
  desk_id uuid REFERENCES auth.desk_sessions (id),
  staff_ref text CHECK (length(staff_ref) <= 100),
  -- Версия снимка, в которой движение записано: по ней движение находится
  -- рядом с остальной работой той же записи.
  snapshot_version integer NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, member_id) REFERENCES uklad.members (org_id, id)
);
CREATE INDEX stock_moves_product ON uklad.stock_moves (org_id, product_ref, at);
CREATE INDEX stock_moves_place ON uklad.stock_moves (org_id, place_kind, place_ref, at);

ALTER TABLE uklad.stock_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.stock_moves FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_moves_read ON uklad.stock_moves FOR SELECT
  USING (org_id = uklad.current_org());
CREATE POLICY stock_moves_write ON uklad.stock_moves FOR INSERT
  WITH CHECK (org_id = uklad.current_org());

-- Только читать и дописывать: UPDATE и DELETE у приложения нет.
GRANT SELECT, INSERT ON uklad.stock_moves TO uklad_app;
