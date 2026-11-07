# Telemetría Divisas · USD/PEN

Dashboard responsive que muestra el tipo de cambio del dólar y crea alertas cuando sube o baja. Stack copiado del portafolio: TanStack Start, React 19, Tailwind 4, Prisma 7 con SQLite (better-sqlite3) y Biome.

## Arranque
```bash
npm install
cp .env.example .env        # pon GEMINI_API_KEY y CRON_SECRET
npm run db:push && npm run db:generate
npm run db:seed             # 6 meses de datos inventados
npm run dev                 # http://localhost:3001
```

## Scraping y alertas
- `src/lib/scraper.ts` prueba en orden cuantoestaeldolar.pe (HTML), la API del BCRP (interbancario) y open.er-api.com.
- `npm run scrape` guarda una lectura. Si la venta varió `ALERT_THRESHOLD_PCT` o más, crea una alerta con la recomendación de Gemini.
- `POST /api/scrape` con `Authorization: Bearer $CRON_SECRET` hace lo mismo para un cron remoto.

## Tareas programadas
| Opción | Cómo |
|---|---|
| Claude local (sesión abierta) | `/loop 1h npm run scrape` |
| Claude en la nube (`/schedule`) | La rutina corre en un sandbox que no ve tu localhost: despliega la app y define `INGEST_URL=https://tu-app/api/scrape` para que `npm run scrape` llame al endpoint |
| Windows (sin Claude) | `schtasks /create /sc hourly /tn divisas /tr "cmd /c cd /d D:\...\telemetria-currencies && npm run scrape"` |

## IA (Gemini)
Pon `GEMINI_API_KEY` en `.env`. Se usa en el botón "Análisis IA" del dashboard, en cada alerta nueva y en la herramienta MCP `ai_advice`.

## MCP
`.mcp.json` registra el servidor `divisas` (`mcp/server.ts`, stdio). Claude Code lo detecta al abrir esta carpeta.
Herramientas: `get_latest_rate`, `get_rate_history`, `get_stats`, `get_alerts`, `query_rates`, `scrape_now`, `ai_advice`.
Ejemplo: *"¿Cuál fue la venta mínima del dólar en los últimos 60 días?"*
