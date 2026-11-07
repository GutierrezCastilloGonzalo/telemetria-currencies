import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowDownRight, ArrowUpRight, MessageSquareText, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";

const loadDashboard = createServerFn({ method: "GET" })
	.validator((days: number) => days)
	.handler(async ({ data }) => {
		const { getDashboard } = await import("#/lib/rates");
		return getDashboard(data);
	});

const scrapeNow = createServerFn({ method: "POST" }).handler(async () => {
	const { runScrape } = await import("#/lib/rates");
	try {
		const { rate, alert } = await runScrape();
		return { ok: true, msg: `${rate.source}: compra ${rate.buy} · venta ${rate.sell}${alert ? ` — ${alert.message}` : ""}` };
	} catch (e) {
		return { ok: false, msg: (e as Error).message };
	}
});

const aiAdvice = createServerFn({ method: "POST" }).handler(async () => {
	const { getAiAdvice } = await import("#/lib/rates");
	return getAiAdvice();
});

export const Route = createFileRoute("/")({
	validateSearch: (s: Record<string, unknown>) => ({ days: Number(s.days) || 90 }),
	loaderDeps: ({ search }) => ({ days: search.days }),
	loader: ({ deps }) => loadDashboard({ data: deps.days }),
	component: Dashboard,
});

const fmt = (n: number | null | undefined, d = 4) => (n == null ? "—" : n.toFixed(d));

function Dashboard() {
	const data = Route.useLoaderData();
	const { days } = Route.useSearch();
	const router = useRouter();
	const navigate = Route.useNavigate();
	const [busy, setBusy] = useState<"scrape" | "ai" | null>(null);
	const [note, setNote] = useState<string | null>(null);
	const [advice, setAdvice] = useState<string | null>(null);
	const up = (data.stats.changePct ?? 0) >= 0;

	return (
		<main className="u-container py-10 sm:py-16">
			<header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
				<div>
					<p className="label label-brand">Telemetría divisas · USD/PEN</p>
					<h1 className="display-title mt-3 text-4xl sm:text-6xl">
						S/ {fmt(data.latest?.sell, 3)}
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Venta · compra S/ {fmt(data.latest?.buy, 3)} · fuente {data.latest?.source ?? "—"} ·{" "}
						{data.latest ? new Date(data.latest.capturedAt).toLocaleString("es-PE") : ""}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Link to="/analisis" className="inline-flex items-center gap-2 rounded-md border border-[var(--brand)] px-4 py-2.5 text-sm font-medium text-[var(--brand-ink)]">
						<MessageSquareText className="size-4" />
						Preguntar (MCP)
					</Link>
					<button
						type="button"
						disabled={!!busy}
						onClick={async () => {
							setBusy("scrape");
							const r = await scrapeNow();
							setNote(r.msg);
							setBusy(null);
							router.invalidate();
						}}
						className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
					>
						<RefreshCw className={`size-4 ${busy === "scrape" ? "animate-spin" : ""}`} />
						Scrapear ahora
					</button>
					<button
						type="button"
						disabled={!!busy}
						onClick={async () => {
							setBusy("ai");
							setAdvice(await aiAdvice());
							setBusy(null);
						}}
						className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium disabled:opacity-60"
					>
						<Sparkles className={`size-4 ${busy === "ai" ? "animate-pulse" : ""}`} />
						Análisis IA (Gemini)
					</button>
				</div>
			</header>

			{note && <p className="mt-4 rounded-md bg-muted px-4 py-3 text-sm">{note}</p>}
			{advice && (
				<section className="mt-4 rounded-md border border-border p-5">
					<p className="label label-brand">Recomendación IA</p>
					<p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{advice}</p>
				</section>
			)}

			<section className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border lg:grid-cols-4">
				{[
					["Mínimo", fmt(data.stats.min, 3)],
					["Máximo", fmt(data.stats.max, 3)],
					["Promedio", fmt(data.stats.avg, 3)],
					["Variación", `${up ? "+" : ""}${fmt(data.stats.changePct, 2)}%`],
				].map(([k, v]) => (
					<div key={k} className="bg-card p-5">
						<p className="label">{k} · {days}d</p>
						<p className="mt-2 font-display text-2xl font-bold tabular-nums">{v}</p>
					</div>
				))}
			</section>

			<section className="mt-8 rounded-md border border-border bg-card p-4 sm:p-6">
				<div className="mb-4 flex items-center justify-between gap-4">
					<p className="label">Venta vs compra (cierre diario)</p>
					<div className="flex gap-1">
						{[30, 90, 180].map((d) => (
							<button
								key={d}
								type="button"
								onClick={() => navigate({ search: { days: d } })}
								className={`rounded px-2.5 py-1 text-xs font-medium ${d === days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
							>
								{d}d
							</button>
						))}
					</div>
				</div>
				<Chart series={data.series} />
			</section>

			<section className="mt-8">
				<p className="label mb-3">Alertas recientes (umbral de variación)</p>
				<ul className="divide-y divide-border rounded-md border border-border bg-card">
					{data.alerts.length === 0 && <li className="p-4 text-sm text-muted-foreground">Sin alertas.</li>}
					{data.alerts.map((a) => (
						<li key={a.id} className="flex items-start gap-3 p-4">
							{a.direction === "UP" ? (
								<ArrowUpRight className="mt-0.5 size-5 shrink-0 text-[var(--destructive)]" />
							) : (
								<ArrowDownRight className="mt-0.5 size-5 shrink-0 text-[var(--brand)]" />
							)}
							<div className="min-w-0">
								<p className="text-sm font-medium">{a.message}</p>
								<p className="text-xs text-muted-foreground">
									{new Date(a.createdAt).toLocaleString("es-PE")} ·{" "}
									{a.direction === "UP" ? "Buen momento para vender USD" : "Buen momento para comprar USD"}
								</p>
								{a.aiAdvice && <p className="mt-2 text-sm">{a.aiAdvice}</p>}
							</div>
						</li>
					))}
				</ul>
			</section>
			<footer className="mt-12 text-xs text-muted-foreground">
				Información referencial. No constituye asesoría financiera.
			</footer>
		</main>
	);
}

function Chart({ series }: { series: { d: string; buy: number; sell: number }[] }) {
	if (series.length < 2) return <p className="text-sm text-muted-foreground">Sin datos.</p>;
	const W = 800;
	const H = 260;
	const vals = series.flatMap((s) => [s.buy, s.sell]);
	const min = Math.min(...vals);
	const max = Math.max(...vals);
	const x = (i: number) => (i / (series.length - 1)) * W;
	const y = (v: number) => H - ((v - min) / (max - min || 1)) * (H - 20) - 10;
	const path = (k: "buy" | "sell") => series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s[k]).toFixed(1)}`).join("");
	return (
		<div>
			<svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full sm:h-72" preserveAspectRatio="none" role="img" aria-label="Gráfico tipo de cambio">
				<path d={path("sell")} fill="none" stroke="var(--brand)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
				<path d={path("buy")} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
			</svg>
			<div className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
				<span>{series[0].d}</span>
				<span className="flex gap-4">
					<span style={{ color: "var(--brand)" }}>— venta</span>
					<span>- - compra</span>
					<span>{min.toFixed(3)}–{max.toFixed(3)}</span>
				</span>
				<span>{series.at(-1)?.d}</span>
			</div>
		</div>
	);
}
