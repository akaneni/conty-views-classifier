import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";

const app = createApp();
const post = (body: unknown, raw = false) =>
  app.request("/classify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });

const stable = Array.from({ length: 48 }, (_, i) => 100 + ((i * 7) % 13));

describe("API", () => {
  it("GET /health responde ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("POST /classify devolve classificação, motivo e sinais", async () => {
    const res = await post({ views_per_hour: stable });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.classification).toBe("organic");
    expect(typeof body.reason).toBe("string");
    expect(body.signals).toHaveLength(3);
  });

  it("série com pico comprado volta suspicious com evidência", async () => {
    const s = [...stable, ...Array(10).fill(150), ...stable, ...Array(8).fill(1500), 20, 18, ...stable];
    const body = await (await post({ views_per_hour: s })).json();
    expect(body.classification).toBe("suspicious");
    expect(body.signals.find((x: any) => x.name === "step_spike").evidence.hour_index).toBe(106);
    expect(body.groups.map((g: any) => [g.name, g.triggered])).toEqual([["plateau_event", true], ["mechanical_repeat", true]]);
  });

  it("série curta volta 200 inconclusive", async () => {
    const res = await post({ views_per_hour: [1, 2, 3] });
    expect(res.status).toBe(200);
    expect((await res.json()).classification).toBe("inconclusive");
  });

  it.each([
    ["JSON inválido", "{nao e json", true],
    ["corpo sem o campo", {}, false],
    ["campo que não é lista", { views_per_hour: "abc" }, false],
    ["valor negativo", { views_per_hour: [...stable, -1] }, false],
    ["inteiro grande demais para ser seguro (1e300)", { views_per_hour: [...stable, 1e300] }, false],
    ["valor fracionário", { views_per_hour: [...stable, 1.5] }, false],
    ["valor que não é número", { views_per_hour: [...stable, "10"] }, false],
    ["lista vazia", { views_per_hour: [] }, false],
    ["lista grande demais", { views_per_hour: new Array(721).fill(1) }, false],
  ])("rejeita com 400 e mensagem em PT-BR: %s", async (_n, body, raw) => {
    const res = await post(body, raw as boolean);
    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe("string");
  });
});
