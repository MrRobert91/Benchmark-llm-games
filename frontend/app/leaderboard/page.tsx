import { BenchmarkDashboard } from "@/components/BenchmarkDashboard";
import { getLeaderboard } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const leaderboard = await getLeaderboard();
  return <>
    <section style={{ marginTop: 44, marginBottom: 26 }}>
      <p className="eyebrow">Moloch Arena V1</p>
      <h1 style={{ fontSize: 34 }}>Compara modelos</h1>
      <p className="lede">Consulta la frecuencia de decisiones UNSAFE, los pagos y los resultados finales. Cada media reúne solo partidas válidas jugadas con las mismas reglas y condiciones.</p>
    </section>
    <BenchmarkDashboard initialData={leaderboard} />
  </>;
}
