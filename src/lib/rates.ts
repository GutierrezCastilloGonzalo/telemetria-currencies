import { prisma } from "./db";
import { advicePrompt, askGemini } from "./gemini";
import { scrapeQuote } from "./scraper";

const threshold = () => Number(process.env.ALERT_THRESHOLD_PCT ?? 0.5);

/** Scrapea, guarda y crea una alerta si la venta varió más que el umbral. */
export async function runScrape() {
	const prev = await prisma.rate.findFirst({ orderBy: { capturedAt: "desc" } });
	const q = await scrapeQuote();
	const rate = await prisma.rate.create({ data: q });
	let alert = null;
	if (prev) {
		const changePct = ((rate.sell - prev.sell) / prev.sell) * 100;
		if (Math.abs(changePct) >= threshold()) {
			const up = changePct > 0;
			const recent = await prisma.rate.findMany({ orderBy: { capturedAt: "desc" }, take: 30 });
			const aiAdvice = await askGemini(advicePrompt(recent.reverse())).catch(() => null);
			alert = await prisma.alert.create({
				data: {
					direction: up ? "UP" : "DOWN",
					changePct,
					fromSell: prev.sell,
					toSell: rate.sell,
					message: `El dólar ${up ? "subió" : "bajó"} ${changePct.toFixed(2)}% (${prev.sell} → ${rate.sell})`,
					aiAdvice,
				},
			});
		}
	}
	return { rate, alert };
}

export async function getDashboard(days = 90) {
	const since = new Date(Date.now() - days * 86_400_000);
	const rates = await prisma.rate.findMany({
		where: { capturedAt: { gte: since } },
		orderBy: { capturedAt: "asc" },
	});
	const alerts = await prisma.alert.findMany({ orderBy: { createdAt: "desc" }, take: 8 });
	const sells = rates.map((r) => r.sell);
	const latest = rates.at(-1) ?? null;
	const first = rates[0] ?? null;
	const byDay = new Map<string, { d: string; buy: number; sell: number }>();
	for (const r of rates) {
		const d = r.capturedAt.toISOString().slice(0, 10);
		byDay.set(d, { d, buy: r.buy, sell: r.sell });
	}
	return {
		latest: latest && { ...latest, capturedAt: latest.capturedAt.toISOString() },
		alerts: alerts.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
		stats: {
			min: sells.length ? Math.min(...sells) : null,
			max: sells.length ? Math.max(...sells) : null,
			avg: sells.length ? sells.reduce((a, b) => a + b, 0) / sells.length : null,
			changePct: latest && first ? ((latest.sell - first.sell) / first.sell) * 100 : null,
		},
		series: [...byDay.values()],
	};
}

export async function getAiAdvice() {
	const recent = await prisma.rate.findMany({ orderBy: { capturedAt: "desc" }, take: 45 });
	return (
		(await askGemini(advicePrompt(recent.reverse()))) ??
		"Configura GEMINI_API_KEY en .env para activar el análisis con IA."
	);
}
