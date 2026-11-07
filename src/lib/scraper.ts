// Fuentes del tipo de cambio USD/PEN. Se prueban en orden; gana la primera válida.
export type Quote = { source: string; buy: number; sell: number };

const UA = { "user-agent": "Mozilla/5.0 telemetria-currencies/1.0" };

/** Scraping HTML de cuantoestaeldolar.pe (mercado paralelo / casas de cambio). */
async function cuantoEstaElDolar(): Promise<Quote> {
	const html = await (await fetch("https://cuantoestaeldolar.pe/", { headers: UA })).text();
	const nums = [...html.matchAll(/S\/\s*([34]\.\d{2,4})/g)].map((m) => Number(m[1]));
	if (nums.length < 2) throw new Error("no se encontraron precios en el HTML");
	return { source: "cuantoestaeldolar", buy: nums[0], sell: nums[1] };
}

/** BCRP: API oficial, tipo de cambio interbancario compra/venta. */
async function bcrp(): Promise<Quote> {
	const to = new Date();
	const from = new Date(to.getTime() - 10 * 86_400_000);
	const f = (d: Date) => d.toISOString().slice(0, 10);
	const url = `https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04639PD-PD04640PD/json/${f(from)}/${f(to)}`;
	const json = (await (await fetch(url, { headers: UA })).json()) as {
		periods: { values: string[] }[];
	};
	const last = json.periods
		.map((p) => p.values.map(Number))
		.filter(([b, s]) => Number.isFinite(b) && Number.isFinite(s))
		.at(-1);
	if (!last) throw new Error("BCRP sin datos");
	return { source: "bcrp", buy: last[0], sell: last[1] };
}

/** Fallback: tasa media de open.er-api.com con spread estimado. */
async function erApi(): Promise<Quote> {
	const json = (await (await fetch("https://open.er-api.com/v6/latest/USD")).json()) as {
		rates: Record<string, number>;
	};
	const mid = json.rates.PEN;
	return { source: "er-api", buy: +(mid - 0.006).toFixed(4), sell: +(mid + 0.006).toFixed(4) };
}

export async function scrapeQuote(): Promise<Quote> {
	const errors: string[] = [];
	for (const fn of [cuantoEstaElDolar, bcrp, erApi]) {
		try {
			const q = await fn();
			if (q.buy > 2 && q.sell > 2 && q.sell < 6 && q.sell >= q.buy) return q;
			errors.push(`${fn.name}: valores fuera de rango`);
		} catch (e) {
			errors.push(`${fn.name}: ${(e as Error).message}`);
		}
	}
	throw new Error(`Todas las fuentes fallaron: ${errors.join(" | ")}`);
}
