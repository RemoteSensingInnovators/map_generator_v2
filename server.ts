import express from "express";
import { createServer as createViteServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import fs from "node:fs";

// Load .env.local for local development
dotenv.config({ path: ".env.local" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ══ Disk Cache Setup ═══════════════════════════════════════════════════════ */
const CACHE_DIR = path.join(__dirname, "cache");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 soat

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`[Cache] Kesh papkasi yaratildi: ${CACHE_DIR}`);
}

function getCacheKey(url: string): string {
  return url.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json";
}

function readCache(key: string): { data: any; cachedAt: number } | null {
  const filePath = path.join(CACHE_DIR, key);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    const age = Date.now() - parsed.cachedAt;
    if (age > CACHE_TTL_MS) {
      fs.unlinkSync(filePath); // Eskirgan keshni o'chirish
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: any): void {
  const filePath = path.join(CACHE_DIR, key);
  try {
    fs.writeFileSync(
      filePath,
      JSON.stringify({ cachedAt: Date.now(), data }),
      "utf-8"
    );
  } catch (err) {
    console.error("[Cache] Yozishda xatolik:", err);
  }
}

/* ══ Main Server ════════════════════════════════════════════════════════════ */
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  /* ── AI Analyze ─────────────────────────────────────────────────────────── */
  app.post("/api/ai-analyze", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "prompt required" });

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 900, temperature: 0.7 },
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return res
          .status(response.status)
          .json({ error: (err as any)?.error?.message || "Gemini xatosi" });
      }

      const data = await response.json();
      const text =
        (data as any)?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      res.json({ text });
    } catch (err: any) {
      console.error("AI endpoint error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  /* ── API Proxy (with disk cache) ─────────────────────────────────────────── */
  app.get("/api/proxy", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL parameter is required" });
    }

    const cacheKey = getCacheKey(url);

    // 1️⃣ Keshdan o'qish
    const cached = readCache(cacheKey);
    if (cached) {
      const ageMin = Math.round((Date.now() - cached.cachedAt) / 60000);
      console.log(`[Cache HIT] ${url} (${ageMin} daqiqa oldin keshlangan)`);
      res.setHeader("X-Cache", "HIT");
      res.setHeader("X-Cache-Age", `${ageMin}min`);
      res.setHeader("Content-Type", "application/json");
      return res.status(200).json(cached.data);
    }

    // 2️⃣ Tarmoqdan yuklash
    try {
      console.log(`[Cache MISS] Tarmoqdan yuklanmoqda: ${url}`);
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
        },
      });

      console.log(`Target status: ${response.status} for ${url}`);

      if (response.status === 404) {
        return res
          .status(404)
          .json({ error: `API qaytargan 404 xatosi: ${url}` });
      }

      if (!response.ok) {
        return res
          .status(response.status)
          .json({ error: `Server xatosi: ${response.status}`, url });
      }

      const data = await response.json();

      // Keshga yozish
      writeCache(cacheKey, data);
      console.log(`[Cache WRITE] ${cacheKey}`);

      res.setHeader("X-Cache", "MISS");
      res.setHeader("Content-Type", "application/json");
      res.status(200).json(data);
    } catch (error: any) {
      console.error("Proxy Error:", error);
      res
        .status(500)
        .json({ error: "API dan ma'lumot yuklashda xatolik", details: error.message });
    }
  });

  /* ── Cache status & clear ─────────────────────────────────────────────── */
  app.get("/api/cache-status", (_req, res) => {
    try {
      const files = fs.readdirSync(CACHE_DIR);
      const items = files.map((f) => {
        const filePath = path.join(CACHE_DIR, f);
        const stat = fs.statSync(filePath);
        let cachedAt = 0;
        try {
          cachedAt = JSON.parse(fs.readFileSync(filePath, "utf-8")).cachedAt || 0;
        } catch {}
        const ageMin = Math.round((Date.now() - cachedAt) / 60000);
        const expired = Date.now() - cachedAt > CACHE_TTL_MS;
        return { file: f, sizeKb: Math.round(stat.size / 1024), ageMin, expired };
      });
      res.json({ count: files.length, ttlHours: CACHE_TTL_MS / 3_600_000, items });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/cache-clear", (_req, res) => {
    try {
      const files = fs.readdirSync(CACHE_DIR);
      files.forEach((f) => fs.unlinkSync(path.join(CACHE_DIR, f)));
      console.log(`[Cache] ${files.length} ta fayl o'chirildi`);
      res.json({ cleared: files.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /* ── Fetch multiple indicators (with cache) ───────────────────────────── */
  app.post("/api/fetch-indicators", async (req, res) => {
    const { indicatorIds } = req.body;

    if (!Array.isArray(indicatorIds) || indicatorIds.length === 0) {
      return res.status(400).json({ error: "indicatorIds massiv kerak" });
    }

    try {
      const results: { [key: string]: any } = {};

      for (const id of indicatorIds) {
        const targetUrl = `https://api.siat.stat.uz/media/uploads/sdmx/sdmx_data_${id}.json`;
        const cacheKey = getCacheKey(targetUrl);

        // Keshdan o'qish
        const cached = readCache(cacheKey);
        if (cached) {
          results[id] = { success: true, data: cached.data, fromCache: true };
          continue;
        }

        try {
          const response = await fetch(targetUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              Accept: "application/json",
            },
          });

          if (response.ok) {
            const json = await response.json();
            writeCache(cacheKey, json);
            results[id] = { success: true, data: json, fromCache: false };
          } else {
            results[id] = { success: false, status: response.status };
          }
        } catch (err: any) {
          results[id] = { success: false, error: err.message };
        }
      }

      res.json(results);
    } catch (error: any) {
      console.error("Multi-indicator fetch error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /* ── Health check ─────────────────────────────────────────────────────── */
  app.get("/api/health", (_req, res) => {
    const files = fs.existsSync(CACHE_DIR) ? fs.readdirSync(CACHE_DIR).length : 0;
    res.json({ status: "ok", cacheDir: CACHE_DIR, cachedFiles: files });
  });

  /* ── Vite dev / static prod ───────────────────────────────────────────── */
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "localhost", () => {
    console.log(`\n✅  Server ishga tushdi: http://localhost:${PORT}`);
    console.log(`📦  Kesh papkasi: ${CACHE_DIR}`);
    console.log(`⏱️   Kesh muddati: 24 soat\n`);
  });
}

startServer();
