import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { prisma } from "../src/lib/db";
import { getAiAdvice, runScrape } from "../src/lib/rates";

// stdout is reserved for the MCP transport: log only to stderr.
const log = (...args: unknown[]) => console.error("[divisas-mcp]", ...args);

const DAY_MS = 86_400_000;

function ok(result: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
	};
}

function fail(err: unknown) {
	const message = err instanceof Error ? err.message : String(err);
	log("tool error:", message);
	return {
		content: [{ type: "text" as const, text: message }],
		isError: true,
	};
}

/** Wraps a tool handler so thrown errors come back as MCP tool errors instead of crashing the server. */
function safe<A>(fn: (args: A) => Promise<unknown>) {
	return async (args: A) => {
		try {
			return ok(await fn(args));
		} catch (err) {
			return fail(err);
		}
	};
}

const server = new McpServer({ name: "divisas", version: "1.0.0" });

server.registerTool(
	"get_latest_rate",
	{
		title: "Latest rate",
		description: "Returns the most recent USD/PEN rate reading (buy, sell, capturedAt).",
	},
	safe(async () => {
		const rate = await prisma.rate.findFirst({ orderBy: { capturedAt: "desc" } });
		return rate;
	}),
);

server.registerTool(
	"get_rate_history",
	{
		title: "Rate history",
		description:
			"Returns the last reading of each day for the last N days, ordered oldest to newest. Each item: {d (YYYY-MM-DD), buy, sell}.",
		inputSchema: {
			days: z.number().int().min(1).max(3650).default(30).describe("Number of days to look back"),
		},
	},
	safe(async ({ days }: { days: number }) => {
		const since = new Date(Date.now() - days * DAY_MS);
		const rates = await prisma.rate.findMany({
			where: { capturedAt: { gte: since } },
			orderBy: { capturedAt: "asc" },
		});
		const byDay = new Map<string, { d: string; buy: number; sell: number }>();
		for (const r of rates) {
			const d = r.capturedAt.toISOString().slice(0, 10);
			byDay.set(d, { d, buy: r.buy, sell: r.sell });
		}
		return [...byDay.values()];
	}),
);

server.registerTool(
	"get_stats",
	{
		title: "Rate statistics",
		description:
			"Min, max and average of buy and sell over the last N days, plus the percentage change from the first to the last reading.",
		inputSchema: {
			days: z.number().int().min(1).max(3650).default(30).describe("Number of days to look back"),
		},
	},
	safe(async ({ days }: { days: number }) => {
		const since = new Date(Date.now() - days * DAY_MS);
		const rates = await prisma.rate.findMany({
			where: { capturedAt: { gte: since } },
			orderBy: { capturedAt: "asc" },
		});
		if (rates.length === 0) return { days, count: 0 };

		const summarize = (values: number[]) => {
			const first = values[0];
			const last = values[values.length - 1];
			return {
				min: Math.min(...values),
				max: Math.max(...values),
				avg: values.reduce((a, b) => a + b, 0) / values.length,
				changePct: ((last - first) / first) * 100,
			};
		};

		return {
			days,
			count: rates.length,
			from: rates[0].capturedAt.toISOString(),
			to: rates[rates.length - 1].capturedAt.toISOString(),
			sell: summarize(rates.map((r) => r.sell)),
			buy: summarize(rates.map((r) => r.buy)),
		};
	}),
);

server.registerTool(
	"get_alerts",
	{
		title: "Recent alerts",
		description: "Returns the most recent alerts (sell-rate moves above the threshold), newest first.",
		inputSchema: {
			limit: z.number().int().min(1).max(200).default(10).describe("Maximum number of alerts"),
		},
	},
	safe(async ({ limit }: { limit: number }) => {
		return prisma.alert.findMany({ orderBy: { createdAt: "desc" }, take: limit });
	}),
);

server.registerTool(
	"query_rates",
	{
		title: "Query rates by date range",
		description: "Returns all rate readings captured between two ISO dates (inclusive), oldest first.",
		inputSchema: {
			from: z.string().describe("Start date, ISO 8601 (e.g. 2026-01-01)"),
			to: z.string().describe("End date, ISO 8601 (e.g. 2026-01-31)"),
		},
	},
	safe(async ({ from, to }: { from: string; to: string }) => {
		const start = new Date(from);
		const end = new Date(to);
		if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
			throw new Error(`Invalid date range: from="${from}" to="${to}"`);
		}
		return prisma.rate.findMany({
			where: { capturedAt: { gte: start, lte: end } },
			orderBy: { capturedAt: "asc" },
		});
	}),
);

server.registerTool(
	"scrape_now",
	{
		title: "Scrape now",
		description:
			"Scrapes the current rate, stores it, and creates an alert if the sell rate moved beyond the threshold. Returns {rate, alert}.",
	},
	safe(async () => runScrape()),
);

server.registerTool(
	"ai_advice",
	{
		title: "AI advice",
		description: "Asks the AI model for advice based on the most recent rate readings.",
	},
	safe(async () => getAiAdvice()),
);

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	log("server started on stdio");
}

process.on("unhandledRejection", (err) => log("unhandled rejection:", err));
process.on("uncaughtException", (err) => log("uncaught exception:", err));

main().catch((err) => {
	log("fatal:", err);
	process.exit(1);
});
