import "dotenv/config";
import express from "express";
import cors from "cors";
import https from "node:https";
import http from "node:http";
import { router } from "./routes.js";

const PORT = Number(process.env.PORT) || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://localhost:3000";

const app = express();

app.use(
  cors({
    origin: ALLOWED_ORIGIN,
    methods: ["GET", "POST"],
  })
);

app.use(express.json());
app.use("/api", router);

if (!process.env.OPENREGISTER_API_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    "\x1b[33m[WARN] OPENREGISTER_API_KEY ist nicht gesetzt. Lege proxy/.env aus .env.example an.\x1b[0m"
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
      console.log(`OpenRegister-Proxy läuft über HTTPS auf https://localhost:${PORT}`);
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
      console.log(`OpenRegister-Proxy läuft über HTTP auf http://localhost:${PORT}`);
    });
  }
}

void start();
