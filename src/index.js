// Shared score store: one Durable Object holds the history for everyone.
import { DurableObject } from "cloudflare:workers";

const SEED = [{ id: "1791015771356", t: 1791015771356, s: 24388 }];

export class ScoreStore extends DurableObject {
  async list() {
    return (await this.ctx.storage.get("pts")) ?? SEED;
  }
  async add(s) {
    const pts = await this.list();
    const last = pts[pts.length - 1];
    if (last && s < last.s) return { error: `Score must be at least ${last.s}`, pts };
    const t = Date.now();
    pts.push({ id: String(t), t, s });
    await this.ctx.storage.put("pts", pts);
    return { pts };
  }
  async undo() {
    const pts = await this.list();
    if (pts.length > 1) pts.pop();
    await this.ctx.storage.put("pts", pts);
    return { pts };
  }
  async reset() {
    const pts = await this.list();
    const keep = [pts[pts.length - 1]];
    await this.ctx.storage.put("pts", keep);
    return { pts: keep };
  }
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    const store = env.STORE.get(env.STORE.idFromName("sara_prins240"));
    if (url.pathname === "/api/scores" && req.method === "GET") return json({ pts: await store.list() });
    if (url.pathname === "/api/scores" && req.method === "POST") {
      const { s } = await req.json().catch(() => ({}));
      if (!Number.isInteger(s) || s < 0) return json({ error: "Enter a whole number" }, 400);
      const r = await store.add(s);
      return json(r, r.error ? 409 : 200);
    }
    if (url.pathname === "/api/scores/last" && req.method === "DELETE") return json(await store.undo());
    if (url.pathname === "/api/scores" && req.method === "DELETE") return json(await store.reset());
    return json({ error: "Not found" }, 404);
  },
};
