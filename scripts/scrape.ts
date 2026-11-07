// Lo ejecuta la tarea programada (Claude /schedule o /loop, Programador de tareas de Windows, cron).
// Con INGEST_URL dispara el endpoint de la app desplegada; sin él escribe directo en SQLite.
try {
	process.loadEnvFile(".env");
} catch {}

const ingest = process.env.INGEST_URL;
if (ingest) {
	const res = await fetch(ingest, {
		method: "POST",
		headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
	});
	console.log(res.status, await res.text());
} else {
	const { runScrape } = await import("../src/lib/rates");
	console.log(JSON.stringify(await runScrape(), null, 2));
	process.exit(0);
}
