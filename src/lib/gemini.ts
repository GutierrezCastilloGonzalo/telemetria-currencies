// Análisis opcional con Gemini (REST, sin SDK). Sin GEMINI_API_KEY devuelve null.
export async function askGemini(prompt: string): Promise<string | null> {
	const key = process.env.GEMINI_API_KEY;
	if (!key) return null;
	const model = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
	const res = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
		{
			method: "POST",
			headers: { "content-type": "application/json", "x-goog-api-key": key },
			body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
		},
	);
	if (!res.ok) return `Gemini no disponible (HTTP ${res.status})`;
	const json = (await res.json()) as {
		candidates?: { content?: { parts?: { text?: string }[] } }[];
	};
	return json.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? null;
}

export function advicePrompt(series: { sell: number; buy: number; capturedAt: Date }[]) {
	const lines = series
		.map((r) => `${r.capturedAt.toISOString().slice(0, 16)} compra ${r.buy} venta ${r.sell}`)
		.join("\n");
	return `Eres analista cambiario en Perú. Datos USD/PEN (más reciente al final):
${lines}
Responde en español, máximo 90 palabras: tendencia y recomendación concreta para
(a) quien necesita comprar dólares, (b) quien necesita vender dólares, (c) un inversionista.
Cierra con: "No es asesoría financiera."`;
}
