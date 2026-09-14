import {
  Building2,
  Clock,
  FileCheck,
  Flame,
  Forklift,
  MapPin,
  Shield,
  ShieldCheck,
  Thermometer,
} from "lucide-react";
import { selectRole, useEditor } from "@/lib/store";
import type { FireCategory, WarehouseClass, WarehouseSpec } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { ScreenShell } from "@/components/fulfillment/ScreenShell";
import { eyebrow } from "@/components/ui/eyebrow";
import { card } from "@/components/ui/card";
import {
  BoolValue,
  ChipsValue,
  ChoiceValue,
  ClassBadge,
  CompletenessRing,
  RangeValue,
  SpecCard,
  StatValue,
  TextValue,
  Tile,
  TileGrid,
} from "./SpecFields";

/**
 * Паспорт склада (п.28, п.1): что это за объект, как он работает, что в нём
 * можно хранить и чем он оснащён.
 *
 * Раскладка карточками, а не одним столбцом строк: характеристик стало сорок,
 * и ровный список «подпись — значение» читался как анкета, в которой ничего не
 * находится. Теперь сверху визитка объекта — класс, ключевые цифры и полнота
 * паспорта, — а ниже секции в две колонки, где цифра выглядит цифрой,
 * перечисление чипами, а «есть / нет» бейджем.
 *
 * Один экран на две роли: склад правит поля прямо на месте (поле притворяется
 * значением, см. `SpecFields`), продавец видит те же данные только на чтение.
 * Отдельной «витрины для продавца» не делаем — вторая копия разъехалась бы с
 * оригиналом на первой же правке, как и с таблицей номенклатуры.
 */

const FIRE_CATEGORIES: FireCategory[] = ["A", "B", "V1", "V2", "V3", "V4", "G", "D"];
const CLASSES: WarehouseClass[] = ["A+", "A", "B+", "B", "C", "D"];

/**
 * Поля, по которым считается полнота паспорта. Список явный: `Object.keys`
 * посчитал бы и `updatedAt`, который заполняется сам и ничего не говорит об
 * объекте.
 */
const COUNTED: (keyof WarehouseSpec)[] = [
  "warehouseClass",
  "builtYear",
  "totalAreaM2",
  "storageAreaM2",
  "ceilingHeightM",
  "floorLoadKgM2",
  "floorType",
  "rackType",
  "palletCapacity",
  "hours",
  "round0Clock",
  "docks",
  "dockType",
  "rampHeightCm",
  "parkingSpots",
  "railSpur",
  "accessNote",
  "tempMinC",
  "tempMaxC",
  "humidityMin",
  "humidityMax",
  "climateNote",
  "equipment",
  "wmsName",
  "networkNote",
  "fireCategory",
  "fireNote",
  "securityNote",
  "guarded",
  "cctvCount",
  "accessControl",
  "restrictions",
  "maxShelfKg",
  "features",
  "condition",
  "insuranceNote",
  "licenses",
  "services",
  "contractNote",
];

export function WarehouseSpecScreen() {
  const warehouse = useEditor((s) => s.warehouse);
  const updateSpec = useEditor((s) => s.updateWarehouseSpec);
  const readOnly = useEditor((s) => selectRole(s) === "seller");
  const t = useT();

  const spec = warehouse.spec ?? {};
  const patch = (p: Partial<WarehouseSpec>) => updateSpec(warehouse.id, p);
  const ro = readOnly;

  // «Заполнено» = значение есть и оно не пустая строка. `false` считается
  // заполненным: «ж/д ветки нет» — это ответ, а не пропуск.
  const filled = COUNTED.filter((k) => {
    const v = spec[k];
    return v !== undefined && v !== "";
  }).length;

  return (
    <ScreenShell
      // Ключ по складу. Поля паспорта держат введённое значение в собственном
      // состоянии (запись уходит в стор по Enter/потере фокуса), а оно не
      // пересоздаётся само — при переходе на другой склад в полях оставались
      // цифры предыдущего. Ключ пересобирает форму вместе со складом.
      key={warehouse.id}
      title={t("spec.title")}
      subtitle={t("spec.subtitle", { name: warehouse.name })}
      wide
    >
      {/* Визитка объекта: класс, адрес, полнота и шесть цифр, которые
          спрашивают первыми в любом разговоре про склад. */}
      <section className={card({ className: "flex flex-col gap-4" })}>
        <div className="flex flex-wrap items-center gap-4">
          <ClassBadge value={spec.warehouseClass} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{warehouse.name}</p>
            {warehouse.address && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{warehouse.address}</span>
              </p>
            )}
            {!ro && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className={eyebrow({ size: "xs", weight: "medium" })}>{t("spec.class")}</span>
                <ChoiceValue
                  value={spec.warehouseClass}
                  options={CLASSES}
                  readOnly={false}
                  onChange={(v) => patch({ warehouseClass: v })}
                />
              </div>
            )}
          </div>
          <CompletenessRing filled={filled} total={COUNTED.length} />
        </div>

        <TileGrid cols={3}>
          <Tile label={t("spec.storageArea")}>
            <StatValue
              value={spec.storageAreaM2}
              unit={t("spec.unit.m2")}
              readOnly={ro}
              onCommit={(v) => patch({ storageAreaM2: v })}
            />
          </Tile>
          <Tile label={t("spec.ceiling")}>
            <StatValue
              value={spec.ceilingHeightM}
              unit={t("spec.unit.m")}
              readOnly={ro}
              onCommit={(v) => patch({ ceilingHeightM: v })}
            />
          </Tile>
          <Tile label={t("spec.palletCapacity")}>
            <StatValue
              value={spec.palletCapacity}
              readOnly={ro}
              onCommit={(v) => patch({ palletCapacity: v })}
            />
          </Tile>
          <Tile label={t("spec.docks")}>
            <StatValue value={spec.docks} readOnly={ro} onCommit={(v) => patch({ docks: v })} />
          </Tile>
          <Tile label={t("spec.floorLoad")}>
            <StatValue
              value={spec.floorLoadKgM2}
              unit={t("spec.unit.kgM2")}
              readOnly={ro}
              onCommit={(v) => patch({ floorLoadKgM2: v })}
            />
          </Tile>
          <Tile label={t("spec.builtYear")}>
            <StatValue
              value={spec.builtYear}
              readOnly={ro}
              onCommit={(v) => patch({ builtYear: v })}
            />
          </Tile>
        </TileGrid>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <SpecCard icon={<Building2 className="size-3.5" />} title={t("spec.buildingTitle")}>
          <TileGrid>
            <Tile label={t("spec.totalArea")}>
              <StatValue
                value={spec.totalAreaM2}
                unit={t("spec.unit.m2")}
                readOnly={ro}
                onCommit={(v) => patch({ totalAreaM2: v })}
              />
            </Tile>
            <Tile label={t("spec.maxShelfKg")}>
              <StatValue
                value={spec.maxShelfKg}
                unit={t("spec.unit.kg")}
                readOnly={ro}
                onCommit={(v) => patch({ maxShelfKg: v })}
              />
            </Tile>
            <Tile label={t("spec.floorType")} wide>
              <TextValue
                value={spec.floorType}
                readOnly={ro}
                placeholder={t("spec.floorTypePlaceholder")}
                onCommit={(v) => patch({ floorType: v })}
              />
            </Tile>
            <Tile label={t("spec.rackType")} wide>
              <TextValue
                value={spec.rackType}
                readOnly={ro}
                placeholder={t("spec.rackTypePlaceholder")}
                onCommit={(v) => patch({ rackType: v })}
              />
            </Tile>
            <Tile label={t("spec.condition")} wide>
              <TextValue
                value={spec.condition}
                readOnly={ro}
                placeholder={t("spec.conditionPlaceholder")}
                onCommit={(v) => patch({ condition: v })}
              />
            </Tile>
          </TileGrid>
        </SpecCard>

        <SpecCard icon={<Clock className="size-3.5" />} title={t("spec.hoursTitle")}>
          <TileGrid>
            <Tile label={t("spec.hours")} wide>
              <TextValue
                value={spec.hours}
                readOnly={ro}
                placeholder={t("spec.hoursPlaceholder")}
                onCommit={(v) => patch({ hours: v })}
              />
            </Tile>
            <Tile label={t("spec.round0Clock")}>
              <BoolValue
                value={spec.round0Clock}
                readOnly={ro}
                onChange={(v) => patch({ round0Clock: v })}
              />
            </Tile>
            <Tile label={t("spec.railSpur")}>
              <BoolValue
                value={spec.railSpur}
                readOnly={ro}
                onChange={(v) => patch({ railSpur: v })}
              />
            </Tile>
            <Tile label={t("spec.rampHeight")}>
              <StatValue
                value={spec.rampHeightCm}
                unit={t("spec.unit.cm")}
                readOnly={ro}
                onCommit={(v) => patch({ rampHeightCm: v })}
              />
            </Tile>
            <Tile label={t("spec.parking")}>
              <StatValue
                value={spec.parkingSpots}
                readOnly={ro}
                onCommit={(v) => patch({ parkingSpots: v })}
              />
            </Tile>
            <Tile label={t("spec.dockType")} wide>
              <TextValue
                value={spec.dockType}
                readOnly={ro}
                placeholder={t("spec.dockTypePlaceholder")}
                onCommit={(v) => patch({ dockType: v })}
              />
            </Tile>
            <Tile label={t("spec.access")} wide>
              <TextValue
                value={spec.accessNote}
                readOnly={ro}
                placeholder={t("spec.accessPlaceholder")}
                onCommit={(v) => patch({ accessNote: v })}
              />
            </Tile>
          </TileGrid>
        </SpecCard>

        <SpecCard icon={<Thermometer className="size-3.5" />} title={t("spec.climateTitle")}>
          <TileGrid>
            <Tile label={t("spec.temp")}>
              <RangeValue
                from={spec.tempMinC}
                to={spec.tempMaxC}
                unit="°C"
                readOnly={ro}
                onCommit={(a, b) => patch({ tempMinC: a, tempMaxC: b })}
              />
            </Tile>
            <Tile label={t("spec.humidity")}>
              <RangeValue
                from={spec.humidityMin}
                to={spec.humidityMax}
                unit="%"
                readOnly={ro}
                onCommit={(a, b) => patch({ humidityMin: a, humidityMax: b })}
              />
            </Tile>
            <Tile label={t("spec.climateNote")} wide>
              <ChipsValue
                value={spec.climateNote}
                readOnly={ro}
                placeholder={t("spec.climatePlaceholder")}
                onCommit={(v) => patch({ climateNote: v })}
              />
            </Tile>
            <Tile label={t("spec.restrictions")} wide>
              <ChipsValue
                value={spec.restrictions}
                readOnly={ro}
                placeholder={t("spec.restrictionsPlaceholder")}
                onCommit={(v) => patch({ restrictions: v })}
              />
            </Tile>
          </TileGrid>
        </SpecCard>

        <SpecCard icon={<Forklift className="size-3.5" />} title={t("spec.equipTitle")}>
          <TileGrid>
            <Tile label={t("spec.equipment")} wide>
              <ChipsValue
                value={spec.equipment}
                readOnly={ro}
                placeholder={t("spec.equipmentPlaceholder")}
                onCommit={(v) => patch({ equipment: v })}
              />
            </Tile>
            <Tile label={t("spec.wms")} wide>
              <TextValue
                value={spec.wmsName}
                readOnly={ro}
                placeholder={t("spec.wmsPlaceholder")}
                onCommit={(v) => patch({ wmsName: v })}
              />
            </Tile>
            <Tile label={t("spec.network")} wide>
              <TextValue
                value={spec.networkNote}
                readOnly={ro}
                placeholder={t("spec.networkPlaceholder")}
                onCommit={(v) => patch({ networkNote: v })}
              />
            </Tile>
            <Tile label={t("spec.features")} wide>
              <ChipsValue
                value={spec.features}
                readOnly={ro}
                placeholder={t("spec.featuresPlaceholder")}
                onCommit={(v) => patch({ features: v })}
              />
            </Tile>
          </TileGrid>
        </SpecCard>

        <SpecCard icon={<Flame className="size-3.5" />} title={t("spec.fireTitle")}>
          <TileGrid>
            <Tile label={t("spec.fireCategory")} wide>
              <ChoiceValue
                value={spec.fireCategory}
                options={FIRE_CATEGORIES}
                labelFor={(c) => t(`spec.fire.${c}`)}
                readOnly={ro}
                onChange={(v) => patch({ fireCategory: v })}
              />
            </Tile>
            <Tile label={t("spec.fireNote")} wide>
              <ChipsValue
                value={spec.fireNote}
                readOnly={ro}
                placeholder={t("spec.firePlaceholder")}
                onCommit={(v) => patch({ fireNote: v })}
              />
            </Tile>
          </TileGrid>
        </SpecCard>

        <SpecCard icon={<ShieldCheck className="size-3.5" />} title={t("spec.securityTitle")}>
          <TileGrid>
            <Tile label={t("spec.guarded")}>
              <BoolValue
                value={spec.guarded}
                readOnly={ro}
                onChange={(v) => patch({ guarded: v })}
              />
            </Tile>
            <Tile label={t("spec.cctv")}>
              <StatValue
                value={spec.cctvCount}
                readOnly={ro}
                onCommit={(v) => patch({ cctvCount: v })}
              />
            </Tile>
            <Tile label={t("spec.security")} wide>
              <TextValue
                value={spec.securityNote}
                readOnly={ro}
                placeholder={t("spec.securityPlaceholder")}
                onCommit={(v) => patch({ securityNote: v })}
              />
            </Tile>
            <Tile label={t("spec.accessControl")} wide>
              <TextValue
                value={spec.accessControl}
                readOnly={ro}
                placeholder={t("spec.accessControlPlaceholder")}
                onCommit={(v) => patch({ accessControl: v })}
              />
            </Tile>
          </TileGrid>
        </SpecCard>

        <SpecCard
          icon={<FileCheck className="size-3.5" />}
          title={t("spec.docsTitle")}
          className="lg:col-span-2"
        >
          <TileGrid cols={2}>
            <Tile label={t("spec.services")} wide>
              <ChipsValue
                value={spec.services}
                readOnly={ro}
                placeholder={t("spec.servicesPlaceholder")}
                onCommit={(v) => patch({ services: v })}
              />
            </Tile>
            <Tile label={t("spec.licenses")}>
              <TextValue
                value={spec.licenses}
                readOnly={ro}
                placeholder={t("spec.licensesPlaceholder")}
                onCommit={(v) => patch({ licenses: v })}
              />
            </Tile>
            <Tile label={t("spec.insurance")}>
              <TextValue
                value={spec.insuranceNote}
                readOnly={ro}
                placeholder={t("spec.insurancePlaceholder")}
                onCommit={(v) => patch({ insuranceNote: v })}
              />
            </Tile>
            <Tile label={t("spec.contract")} wide>
              <TextValue
                value={spec.contractNote}
                readOnly={ro}
                placeholder={t("spec.contractPlaceholder")}
                onCommit={(v) => patch({ contractNote: v })}
              />
            </Tile>
          </TileGrid>
        </SpecCard>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Shield className="size-3" />
        {spec.updatedAt
          ? t("spec.updated", {
              d: new Date(spec.updatedAt).toLocaleDateString(),
            })
          : t("spec.neverUpdated")}
      </p>
    </ScreenShell>
  );
}
