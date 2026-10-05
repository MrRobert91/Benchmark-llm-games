import { BenchmarkDashboard } from "@/components/BenchmarkDashboard";
import { getLeaderboard } from "@/lib/data";
import Link from "next/link";
import { ResearchExplorer } from "@/components/ResearchExplorer";
import reportJson from "@/public/data/research.json";
import type { ResearchReport } from "@/lib/research-types";

const report = reportJson as unknown as ResearchReport;
const charts = [
  ["first-five", "Primeras cinco rondas · figura 3"],
  ["risk-curves", "Respuesta al riesgo · tabla 12 y referencia evolutiva"],
  ["embeddings", "HDBSCAN y t-SNE · figuras 4–6"],
  ["population-panels", "Cada población en las mismas coordenadas · figura 5"],
  ["clusters", "Composición de grupos por modelo · figura 4"],
  ["profiles", "Perfiles de acciones y posición · figura 7"],
  ["distribution-density", "Distribuciones por familia y riesgo · figura 8"],
  ["distributions", "Distribuciones sin suavizar · control de la figura 8"],
  ["drivers", "Random forest y TreeSHAP · figura 11"],
  ["multiplayer", "N=3,4,5 · tabla 13"],
  ["position-bands", "Posición y banda de persona · figura 9"],
  ["personas", "Persona y riesgo mecánico · técnica de la figura 10"],
  ["task-validity", "Auditoría de comprensión · tablas 2 y 7"],
  ["arithmetic", "Aritmética divulgada · tabla 3"],
  ["live-context", "Robustez ante narrativas y códigos equivalentes"],
];

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const leaderboard = await getLeaderboard();
  return <>
    <section style={{ marginTop: 44, marginBottom: 26 }}>
      <p className="eyebrow">Moloch Arena V1</p>
      <h1 style={{ fontSize: 34 }}>Compara modelos</h1>
      <p className="lede">Compara la campaña de RustyRoboz con el paper y consulta la frecuencia de decisiones UNSAFE, los pagos y los resultados finales. Cada celda conserva su protocolo, riesgo y número de jugadores.</p>
      <Link className="btn" href="/results">Ver el paper, sus figuras y la campaña de reproducción →</Link>
      <a className="btn" href="#live-results">Ver todas las aportaciones vivas ↓</a>
      <p className="note">Campaña congelada del 5 de octubre de 2026: {report.total} carreras, {new Set(report.contributions.map(c=>c.model)).size} modelos y {(report.spent_usd/report.manifest.usd_per_eur).toFixed(2)} € contabilizados. Admisión por formato, comprensión evaluada aparte. Los prompts son una reconstrucción metodológica; las diferencias no demuestran equivalencia con el paper.</p>
    </section>
    <div className="research-page"><ResearchExplorer report={report}/>
      <details className="card"><summary>Gráficas de la campaña · mismas comparaciones del paper</summary>{charts.map(([file,title])=><figure className="research-figure" key={file}><a href={`/research/${file}.svg`} target="_blank" rel="noreferrer"><img src={`/research/${file}.svg`} alt={title} loading="lazy"/></a><figcaption><strong>RustyRoboz · {title}.</strong> Métodos, referencias y límites en <Link className="link" href="/results">Resultados</Link>. <a className="link" href={`/research/${file}.svg`} target="_blank" rel="noreferrer">Ampliar gráfica ↗</a></figcaption></figure>)}</details>
    </div>
    <section id="live-results"><p className="eyebrow">Todas las aportaciones · datos vivos</p><h2>Resultados acumulados de la arena</h2><p>Estos datos se actualizan con nuevas ejecuciones. Las carreras históricas, canónicas y diagnósticas se muestran en filas separadas por protocolo; sus medias no se mezclan con la campaña congelada de arriba.</p><BenchmarkDashboard initialData={leaderboard}/></section>
  </>;
}
