import { Hono } from "hono";
import { classify } from "./classify.ts";
import { MAX_SERIES_LENGTH } from "./thresholds.ts";

function validate(body: unknown): { views: number[] } | { error: string } {
  const list = (body as { views_per_hour?: unknown } | null)?.views_per_hour;
  if (!Array.isArray(list)) return { error: "views_per_hour deve ser uma lista de números" };
  if (list.length === 0) return { error: "views_per_hour não pode ser vazia" };
  if (list.length > MAX_SERIES_LENGTH) return { error: `views_per_hour aceita no máximo ${MAX_SERIES_LENGTH} horas` };
  if (!list.every((v) => typeof v === "number" && Number.isInteger(v) && v >= 0)) {
    return { error: "views_per_hour deve conter apenas inteiros maiores ou iguais a zero" };
  }
  return { views: list as number[] };
}

export function createApp(): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.post("/classify", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "corpo inválido: envie JSON" }, 400);
    }
    const parsed = validate(body);
    if ("error" in parsed) return c.json({ error: parsed.error }, 400);
    return c.json(classify(parsed.views));
  });

  app.onError((_e, c) => c.json({ error: "erro interno" }, 500));
  return app;
}
