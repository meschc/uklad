import { describe, expect, it } from "vitest";
import { seedWork } from "../seedWork";
import { peaksByStaff, startOfDay, workedMs } from "../../workstation";
import { operationLog, serviceReport } from "../../operations";
import type { Partner, Product, StaffMember } from "../../types";

const NOW = new Date(2026, 10, 10, 15, 0).getTime(); // вторник, 15:00
const staff = [
  { id: "s1", name: "А", role: "Управляющий склада" },
  { id: "s2", name: "Б", role: "Кладовщик" },
  { id: "s3", name: "В", role: "Комплектовщик" },
] as StaffMember[];
const partners = [{ id: "p1", name: "ИП" }] as Partner[];
const products = [{ id: "g1", partnerId: "p1" }] as Product[];

describe("seedWork", () => {
  const w = seedWork(staff, partners, products, NOW);

  it("у людей склада есть часы и пики, у управляющего — нет", () => {
    const from = NOW - 30 * 86_400_000;
    expect(workedMs(w.staffEvents, "s2", from, NOW)).toBeGreaterThan(0);
    expect(workedMs(w.staffEvents, "s1", from, NOW)).toBe(0);
    const peaks = peaksByStaff(w.staffEvents, startOfDay(NOW), NOW + 1);
    expect(peaks.get("s2")?.pack).toBeGreaterThan(0);
    expect(peaks.get("s3")?.pick).toBeGreaterThan(0);
  });

  it("нет событий из будущего", () => {
    expect(w.staffEvents.every((e) => e.at <= NOW)).toBe(true);
    expect(w.tasks.every((t) => (t.doneAt ?? t.createdAt) <= NOW)).toBe(true);
  });

  it("отчёт по услугам считается в деньгах", () => {
    const log = operationLog({
      tasks: w.tasks,
      pallets: [],
      boxes: [],
      receivingEvents: [],
      requests: [],
      shipments: [],
      products,
    });
    const r = serviceReport(log, w.serviceSettings, { from: 0, to: NOW });
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.unpriced).toBe(false);
    expect(r.total).toBeGreaterThan(0);
  });

  it("задания в разных статусах", () => {
    const st = new Set(w.tasks.map((t) => t.status));
    expect(st).toEqual(new Set(["done", "in_progress", "open"]));
  });
});
