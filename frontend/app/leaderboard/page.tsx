import { BenchmarkDashboard } from "@/components/BenchmarkDashboard";
import { getLeaderboard } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const leaderboard = await getLeaderboard();
  return <>
    <section style={{ marginTop: 44, marginBottom: 26 }}>
      <p className="eyebrow">Moloch Arena V1</p>
      <h1 style={{ fontSize: 34 }}>Leaderboard reproducible</h1>
      <p className="lede">Compara modelos y proveedores con las métricas del benchmark: tasa UNSAFE, payoff, liderazgo, setback y admisión. Los resultados proceden de las trazas persistidas y se actualizan al terminar cada ejecución web.</p>
    </section>
    <BenchmarkDashboard initialData={leaderboard} />
  </>;
}
