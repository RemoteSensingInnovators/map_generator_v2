import express from "express";
import { createServer as createViteServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Load .env.local for local development
dotenv.config({ path: ".env.local" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Server-side Gemini API key (never exposed to browser) ──────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // JSON parsing middleware
  app.use(express.json());

  // ── AI Analyze endpoint — server-side, key hidden ─────────────────────────
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
            generationConfig: { maxOutputTokens: 900, temperature: 0.7 }
          })
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return res.status(response.status).json({ error: err?.error?.message || "Gemini xatosi" });
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      res.json({ text });
    } catch (err: any) {
      console.error("AI endpoint error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Proxy Route to bypass CORS
  app.get("/api/proxy", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL parameter is required" });
    }

    try {
      console.log(`Proxying request to: ${url}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
        }
      });
      
      console.log(`Target status: ${response.status} for ${url}`);
      const contentType = response.headers.get("content-type");
      const data = await response.text();

      if (response.status === 404) {
        console.error(`404 received from target: ${url}`);
      }

      // Forward headers if needed, or simply return the data
      res.setHeader("Content-Type", contentType || "application/json");
      res.status(response.status).send(data);
    } catch (error: any) {
      console.error("Proxy Error:", error);
      res.status(500).json({ error: "Failed to fetch from external API", details: error.message });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
