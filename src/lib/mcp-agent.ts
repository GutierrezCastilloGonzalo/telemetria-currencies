// Agente de análisis: Gemini responde preguntas usando las herramientas del servidor MCP (mcp/server.ts).
// La app actúa como cliente MCP por stdio; Gemini decide qué herramientas llamar (function calling).
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

try {
	process.loadEnvFile(".env");
} catch {}

// Herramientas que el agente no debe usar al responder (escriben datos o llaman a Gemini otra vez).
const EXCLUDED = new Set(["scrape_now", "ai_advice"]);
const MAX_STEPS = 6;
const FALLBACK_MODELS = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite"];

let clientPromise: Promise<Client> | null = null;

function getClient() {
	clientPromise ??= (async () => {
		const cwd = process.cwd();
		const transport = new StdioClientTransport({
			command: process.execPath,
			args: [path.join(cwd, "node_modules/tsx/dist/cli.mjs"), path.join(cwd, "mcp/server.ts")],
			cwd,
			stderr: "ignore",
		});
		const client = new Client({ name: "divisas-web", version: "1.0.0" });
		await client.connect(transport);
		transport.onclose = () => {
			clientPromise = null;
		};
		return client;
	})().catch((e) => {
		clientPromise = null;
		throw e;
	});
	return clientPromise;
}

type Part = {
	text?: string;
	functionCall?: { name: string; args?: Record<string, unknown> };
	functionResponse?: unknown;
	thought?: boolean;
};
type Content = { role: "user" | "model"; parts: Part[] };

export type ToolStep = { tool: string; args: Record<string, unknown>; ok: boolean };
export type AnalysisResult = { answer: string; steps: ToolStep[]; error?: string };

const SYSTEM = `Eres un analista cambiario para Perú (USD/PEN). Hoy es ${new Date().toISOString().slice(0, 10)}.
Usa SIEMPRE las herramientas para obtener datos; nunca inventes cifras. "sell" es venta (lo que pagas al comprar dólares), "buy" es compra (lo que recibes al vender dólares).
Responde en español, claro y breve (máx. 150 palabras), con cifras concretas, y una recomendación accionable si aplica.
Usa viñetas "- " cuando ayude. Termina con: "No es asesoría financiera."`;

export async function analyze(question: string): Promise<AnalysisResult> {
	const key = process.env.GEMINI_API_KEY;
	if (!key) {
		return { answer: "", steps: [], error: "Falta GEMINI_API_KEY en el archivo .env (y reinicia npm run dev)." };
	}
	const model = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
	const client = await getClient();
	const { tools } = await client.listTools();
	const functionDeclarations = tools
		.filter((t) => !EXCLUDED.has(t.name))
		.map((t) => {
			const { $schema: _s, ...schema } = t.inputSchema as Record<string, unknown>;
			return { name: t.name, description: t.description ?? t.name, parametersJsonSchema: schema };
		});

	const contents: Content[] = [{ role: "user", parts: [{ text: question }] }];
	const steps: ToolStep[] = [];

	// Si un modelo está saturado (429/5xx) o no disponible (404), se pasa al siguiente.
	const models = [...new Set([model, ...FALLBACK_MODELS])];
	let mi = 0;

	for (let i = 0; i < MAX_STEPS; i++) {
		let res: Response;
		try {
			res = await fetch(
				`https://generativelanguage.googleapis.com/v1beta/models/${models[mi]}:generateContent`,
				{
					method: "POST",
					signal: AbortSignal.timeout(45_000),
					headers: { "content-type": "application/json", "x-goog-api-key": key },
					body: JSON.stringify({
						systemInstruction: { parts: [{ text: SYSTEM }] },
						contents,
						tools: [{ functionDeclarations }],
					}),
				},
			);
		} catch (e) {
			res = new Response((e as Error).message, { status: 504 });
		}
		if (!res.ok) {
			const body = await res.text();
			const retryable = res.status === 404 || res.status === 429 || res.status >= 500;
			if (retryable && mi < models.length - 1) {
				mi++;
				i--;
				continue;
			}
			const busy = res.status === 429 || res.status === 503;
			return {
				answer: "",
				steps,
				error: busy
					? "Gemini está saturado en este momento. Intenta de nuevo en unos segundos."
					: `Gemini HTTP ${res.status}: ${body.slice(0, 300)}`,
			};
		}
		const json = (await res.json()) as { candidates?: { content?: Content }[] };
		const content = json.candidates?.[0]?.content;
		if (!content?.parts?.length) return { answer: "", steps, error: "Gemini no devolvió respuesta." };
		contents.push({ role: "model", parts: content.parts });

		const calls = content.parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
		if (calls.length === 0) {
			const answer = content.parts
				.filter((p) => p.text && !p.thought)
				.map((p) => p.text)
				.join("")
				.trim();
			return { answer, steps };
		}

		const responses: Part[] = [];
		for (const call of calls) {
			const args = call.args ?? {};
			let result: string;
			let ok = true;
			try {
				const out = await client.callTool({ name: call.name, arguments: args });
				ok = !out.isError;
				result = (out.content as { type: string; text?: string }[])
					.map((c) => c.text ?? "")
					.join("\n");
			} catch (e) {
				ok = false;
				result = (e as Error).message;
			}
			steps.push({ tool: call.name, args, ok });
			responses.push({ functionResponse: { name: call.name, response: { result } } });
		}
		contents.push({ role: "user", parts: responses });
	}
	return { answer: "", steps, error: "Se alcanzó el máximo de pasos sin respuesta final." };
}
