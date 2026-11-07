import { createFileRoute } from "@tanstack/react-router";
import { runScrape } from "#/lib/rates";

// POST /api/scrape   Authorization: Bearer $CRON_SECRET
export const Route = createFileRoute("/api/scrape")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
					return new Response("unauthorized", { status: 401 });
				}
				try {
					return Response.json(await runScrape());
				} catch (e) {
					return Response.json({ error: (e as Error).message }, { status: 502 });
				}
			},
		},
	},
});
