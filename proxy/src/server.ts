import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import https from "node:https";
import http from "node:http";
import { router, adminRouter, userLimit } from "./routes.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const PORT = Number(process.env.PORT) || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://localhost:3000";
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 300;

const app = express();
app.set("trust proxy", 1); // hinter Reverse-Proxy/Load-Balancer korrekte Client-IP

// Sicherheits-Header. CSP aus, da die Admin-Seite (/admin) ein Inline-Script
// nutzt; alle übrigen helmet-Schutzheader (HSTS, noSniff, frameguard …) bleiben.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  cors({
    origin: ALLOWED_ORIGIN,
    methods: ["GET", "POST"],
  })
);

// Rate-Limiting pro IP (Fenster 15 min) – schützt Upstream-Credits vor Missbrauch.
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Zu viele Anfragen. Bitte später erneut versuchen." },
  })
);

app.use(express.json({ limit: "256kb" }));

// Admin-Oberfläche (statische Seite) – verwaltet Nutzer & Limits.
const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "public");
app.get("/admin", (_req, res) => res.sendFile(resolve(PUBLIC_DIR, "admin.html")));

// Admin-API vor der Limit-Middleware (eigene Authentifizierung via ADMIN_TOKEN).
app.use("/api/admin", adminRouter);
// Credit-Endpunkte: Nutzer-Token + Limit erzwingen (nur wenn ADMIN_TOKEN gesetzt).
app.use("/api", userLimit, router);

if (!process.env.HANDELSREGISTER_API_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    "\x1b[33m[WARN] HANDELSREGISTER_API_KEY ist nicht gesetzt. Lege proxy/.env aus .env.example an.\x1b[0m"
  );
}

/**
 * Startet den Server bevorzugt über HTTPS (nötig, weil das Add-in von einem
 * HTTPS-Origin aus fetcht – sonst blockiert der Browser Mixed Content).
 * Fällt nur dann auf HTTP zurück, wenn keine Dev-Zertifikate verfügbar sind.
 */
async function start(): Promise<void> {
  try {
    const devCerts = await import("office-addin-dev-certs");
    const httpsOptions = await devCerts.getHttpsServerOptions();
    https.createServer({ key: httpsOptions.key, cert: httpsOptions.cert }, app).listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`handelsregister.ai-Proxy läuft über HTTPS auf https://localhost:${PORT}`);
      // eslint-disable-next-line no-console
      console.log(`Erlaubter Origin (CORS): ${ALLOWED_ORIGIN}`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "\x1b[33m[WARN] Konnte keine HTTPS-Dev-Zertifikate laden – starte über HTTP. " +
        "Führe `npx office-addin-dev-certs install` aus, damit das Add-in (HTTPS) den Proxy erreichen kann.\x1b[0m",
      (err as Error).message
    );
    http.createServer(app).listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`handelsregister.ai-Proxy läuft über HTTP auf http://localhost:${PORT}`);
    });
  }
}

void start();
