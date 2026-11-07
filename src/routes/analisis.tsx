import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowLeft, Send, Sparkles, Wrench } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { AnalysisResult } from "#/lib/mcp-agent";

const ask = createServerFn({ method: "POST" })
	.validator((q: string) => {
		const s = String(q ?? "").trim();
		if (!s || s.length > 500) throw new Error("Pregunta vacía o demasiado larga");
		return s;
	})
	.handler(async ({ data }): Promise<AnalysisResult> => {
		const { analyze } = await import("#/lib/mcp-agent");
		try {
			return await analyze(data);
		} catch (e) {
			return { answer: "", steps: [], error: (e as Error).message };
		}
	});

const GROUPS: { title: string; questions: string[] }[] = [
	{
		title: "Comprar dólares",
		questions: [
			"¿Es buen momento para comprar dólares hoy comparado con el promedio de los últimos 30 días?",
			"¿Cuál fue la venta mínima en los últimos 60 días y qué tan lejos estamos de ella?",
		],
	},
	{
		title: "Vender dólares",
		questions: [
			"¿Conviene vender dólares ahora o esperar? Compara con el máximo de los últimos 90 días.",
			"¿Cómo ha evolucionado el precio de compra en las últimas 2 semanas?",
		],
	},
	{
		title: "Inversión",
		questions: [
			"¿Cuál es la tendencia del dólar en los últimos 6 meses y qué estrategia sugieres a un inversionista?",
			"¿Qué tan volátil ha estado el dólar este mes frente a los meses anteriores?",
		],
	},
	{
		title: "Alertas",
		questions: [
			"Resume las últimas alertas: ¿predominan las subidas o las bajadas?",
			"¿Cuál fue la variación más fuerte registrada en las alertas recientes?",
		],
	},
];

const TOOL_LABEL: Record<string, string> = {
	get_latest_rate: "Último tipo de cambio",
	get_rate_history: "Historial",
	get_stats: "Estadísticas",
	get_alerts: "Alertas",
	query_rates: "Rango de fechas",
};

export const Route = createFileRoute("/analisis")({
	head: () => ({ meta: [{ title: "Análisis IA · Telemetría Divisas" }] }),
	component: Analisis,
});

type Entry = { q: string; result?: AnalysisResult };

function Analisis() {
	const [history, setHistory] = useState<Entry[]>([]);
	const [input, setInput] = useState("");
	const busy = history.some((h) => !h.result);

	async function run(q: string) {
		if (busy || !q.trim()) return;
		setInput("");
		setHistory((h) => [{ q }, ...h]);
		let result: AnalysisResult;
		try {
			result = await ask({ data: q });
		} catch (e) {
			result = { answer: "", steps: [], error: (e as Error).message };
		}
		setHistory((h) => h.map((e, i) => (i === 0 ? { ...e, result } : e)));
	}

	return (
		<main className="u-container py-10 sm:py-16">
			<Link to="/" search={{ days: 90 }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
				<ArrowLeft className="size-4" /> Dashboard
			</Link>
			<header className="mt-4 border-b border-border pb-8">
				<p className="label label-brand">Análisis IA · MCP + Gemini</p>
				<h1 className="display-title mt-3 text-3xl sm:text-5xl">Pregúntale a tus datos</h1>
				<p className="mt-3 max-w-2xl text-sm text-muted-foreground">
					Elige una pregunta. Gemini consulta la base de datos mediante las herramientas del servidor
					MCP <code className="rounded bg-muted px-1">divisas</code> y responde con cifras reales.
				</p>
			</header>

			<div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
				<section aria-label="Preguntas sugeridas" className="space-y-6">
					{GROUPS.map((g) => (
						<div key={g.title}>
							<p className="label mb-2">{g.title}</p>
							<div className="flex flex-col gap-2">
								{g.questions.map((q) => (
									<button
										key={q}
										type="button"
										disabled={busy}
										onClick={() => run(q)}
										className="rounded-md border border-border bg-card px-4 py-3 text-left text-sm transition-colors hover:border-[var(--brand)] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
									>
										{q}
									</button>
								))}
							</div>
						</div>
					))}
					<form
						onSubmit={(e) => {
							e.preventDefault();
							run(input);
						}}
						className="flex gap-2"
					>
						<input
							value={input}
							onChange={(e) => setInput(e.target.value)}
							maxLength={500}
							placeholder="O escribe tu propia pregunta…"
							className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
						/>
						<button
							type="submit"
							disabled={busy || !input.trim()}
							aria-label="Enviar pregunta"
							className="inline-flex items-center rounded-md bg-primary px-3.5 text-primary-foreground disabled:opacity-60"
						>
							<Send className="size-4" />
						</button>
					</form>
				</section>

				<section aria-label="Respuestas" aria-live="polite" className="space-y-4">
					{history.length === 0 && (
						<div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
							<Sparkles className="mx-auto mb-3 size-6 text-[var(--brand)]" />
							Las respuestas aparecerán aquí.
						</div>
					)}
					{history.map((h, i) => (
						<article key={`${history.length - i}`} className="rounded-md border border-border bg-card p-5">
							<p className="text-sm font-medium">{h.q}</p>
							{!h.result ? (
								<p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
									<Sparkles className="size-4 animate-pulse text-[var(--brand)]" />
									Consultando herramientas MCP y analizando…
								</p>
							) : (
								<>
									{h.result.steps.length > 0 && (
										<div className="mt-3 flex flex-wrap gap-1.5">
											{h.result.steps.map((s, j) => (
												<span
													// biome-ignore lint/suspicious/noArrayIndexKey: static list
													key={j}
													title={JSON.stringify(s.args)}
													className={`inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs ${s.ok ? "text-muted-foreground" : "text-[var(--destructive)]"}`}
												>
													<Wrench className="size-3" />
													{TOOL_LABEL[s.tool] ?? s.tool}
													{Object.keys(s.args).length > 0 && ` (${Object.values(s.args).join(", ")})`}
												</span>
											))}
										</div>
									)}
									{h.result.error ? (
										<p className="mt-4 rounded bg-muted px-3 py-2 text-sm text-[var(--destructive)]">{h.result.error}</p>
									) : (
										<div className="mt-4 space-y-2 text-sm leading-relaxed">
											<Markdown text={h.result.answer} />
										</div>
									)}
								</>
							)}
						</article>
					))}
				</section>
			</div>
		</main>
	);
}

/** Markdown mínimo: párrafos, viñetas y **negritas**. */
function Markdown({ text }: { text: string }) {
	const inline = (s: string): ReactNode[] =>
		s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
			part.startsWith("**") && part.endsWith("**") ? (
				// biome-ignore lint/suspicious/noArrayIndexKey: static split
				<strong key={i}>{part.slice(2, -2)}</strong>
			) : (
				part
			),
		);
	const blocks: ReactNode[] = [];
	let list: string[] = [];
	const flush = () => {
		if (list.length) {
			blocks.push(
				<ul key={blocks.length} className="list-disc space-y-1 pl-5">
					{list.map((l, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static list
						<li key={i}>{inline(l)}</li>
					))}
				</ul>,
			);
			list = [];
		}
	};
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		const m = line.match(/^[-*•]\s+(.*)/);
		if (m) list.push(m[1]);
		else {
			flush();
			if (line) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ""))}</p>);
		}
	}
	flush();
	return <>{blocks}</>;
}
