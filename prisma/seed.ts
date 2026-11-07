// Datos inventados: ~6 meses de compra/venta USD/PEN, 3 lecturas por día.
import { prisma } from "../src/lib/db";

async function main() {
	await prisma.alert.deleteMany();
	await prisma.rate.deleteMany();
	const days = 180;
	let mid = 3.52;
	let prevSell: number | null = null;
	const rows = [];
	const alerts = [];
	const start = Date.now() - days * 86_400_000;
	for (let d = 0; d < days; d++) {
		for (const hour of [9, 13, 17]) {
			// paseo aleatorio con leve reversión a la media (3.46)
			mid += (Math.random() - 0.5) * 0.03 + (3.46 - mid) * 0.01;
			const spread = 0.012 + Math.random() * 0.01;
			const t = new Date(start + d * 86_400_000);
			t.setHours(hour, 0, 0, 0);
			const sell = +(mid + spread / 2).toFixed(4);
			rows.push({ source: "seed", buy: +(mid - spread / 2).toFixed(4), sell, capturedAt: t });
			if (prevSell) {
				const changePct = ((sell - prevSell) / prevSell) * 100;
				if (Math.abs(changePct) >= 0.35) {
					const up = changePct > 0;
					alerts.push({
						direction: up ? "UP" : "DOWN",
						changePct,
						fromSell: prevSell,
						toSell: sell,
						message: `El dólar ${up ? "subió" : "bajó"} ${changePct.toFixed(2)}% (${prevSell} → ${sell})`,
						createdAt: t,
					});
				}
			}
			prevSell = sell;
		}
	}
	await prisma.rate.createMany({ data: rows });
	await prisma.alert.createMany({ data: alerts });
	console.log(`Seed: ${rows.length} tasas, ${alerts.length} alertas`);
}

main().finally(() => prisma.$disconnect());
