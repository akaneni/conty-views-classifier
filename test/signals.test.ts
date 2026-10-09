import { describe, expect, it } from "vitest";
import { abruptDrop, mechanicalRepeat, stepSpike } from "../src/signals.ts";

const flat = (n: number, v = 100) => Array.from({ length: n }, (_, i) => v + (i % 5) * 3);

describe("step_spike", () => {
  it("dispara em salto de 10x sem rampa que se mantém no alto", () => {
    const s = [...flat(30), ...Array(8).fill(1000)];
    const r = stepSpike(s);
    expect(r.triggered).toBe(true);
    expect(r.evidence?.hour_index).toBe(30);
    expect(r.evidence?.value).toBe(1000);
  });

  it("dispara em pico de 1 hora que volta à base em 1 hora", () => {
    const s = [...flat(30), 1200, ...flat(10)];
    expect(stepSpike(s).triggered).toBe(true);
  });

  it("não dispara quando há rampa antes do salto", () => {
    const s = [...flat(30), 150, 260, 1000, 1000, 1000, 1000, 1000, 1000, 1000];
    expect(stepSpike(s).triggered).toBe(false);
  });

  it("não dispara quando o pico decai aos poucos", () => {
    const decay = [1000, 800, 640, 510, 410, 330, 260, 210, 170, 140];
    expect(stepSpike([...flat(30), ...decay]).triggered).toBe(false);
  });

  it("não dispara com salto abaixo do mínimo absoluto (canal pequeno)", () => {
    expect(stepSpike([...Array(30).fill(2), 20, 20, 20, 20, 20, 20, 20]).triggered).toBe(false);
  });

  it("não dispara sem histórico suficiente antes do salto", () => {
    expect(stepSpike([100, 100, 1000, 1000, 1000, 1000, 1000, 1000, 1000]).triggered).toBe(false);
  });
});

describe("mechanical_repeat", () => {
  it("dispara com 8 horas idênticas", () => {
    const s = [...flat(20), ...Array(8).fill(400), ...flat(10)];
    const r = mechanicalRepeat(s);
    expect(r.triggered).toBe(true);
    expect(r.evidence?.hour_index).toBe(20);
  });

  it("dispara com crescimento sempre igual a cada hora", () => {
    const s = [...flat(20), ...Array.from({ length: 9 }, (_, i) => 300 + i * 25), ...flat(5)];
    expect(mechanicalRepeat(s).triggered).toBe(true);
  });

  it("não dispara com 7 horas idênticas", () => {
    const s = [...flat(20), ...Array(7).fill(400), ...flat(10)];
    expect(mechanicalRepeat(s).triggered).toBe(false);
  });

  it("não dispara com variação de 5% (humano)", () => {
    const s = Array.from({ length: 40 }, (_, i) => Math.round(400 * (1 + 0.05 * Math.sin(i * 2.3))));
    expect(mechanicalRepeat(s).triggered).toBe(false);
  });

  it("não dispara com zeros seguidos (vídeo parado não é robô)", () => {
    expect(mechanicalRepeat(Array(40).fill(0)).triggered).toBe(false);
  });
});

describe("abrupt_drop", () => {
  it("dispara com queda de 90% em 1 hora depois de platô alto", () => {
    const s = [...flat(30), 600, 620, 610, 605, 40, 35, 30];
    const r = abruptDrop(s);
    expect(r.triggered).toBe(true);
    expect(r.evidence?.hour_index).toBe(34);
  });

  it("não dispara com queda gradual", () => {
    const s = [...flat(30), 600, 620, 610, 450, 300, 200, 120, 80];
    expect(abruptDrop(s).triggered).toBe(false);
  });

  it("não dispara se o platô durou menos de 3 horas", () => {
    const s = [...flat(30), 600, 620, 40, 35];
    expect(abruptDrop(s).triggered).toBe(false);
  });
});
