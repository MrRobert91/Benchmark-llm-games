import Link from "next/link";

import { getGames } from "@/lib/data";
import { OUTCOME_LABEL } from "@/lib/types";

const KIND_CLASS: Record<string, string> = {
  catastrophe: "tag-fast",
  restraint: "tag-safe",
  aligned_win: "tag-warn",
};

export const dynamic = "force-dynamic";

export default async function ArenaListPage() {
  const games = await getGames();

  return (
    <>
      <section style={{ marginTop: 44, marginBottom: 26 }}>
        <p className="eyebrow">Archivo</p>
        <h1 style={{ fontSize: 34 }}>Partidas</h1>
        <p className="lede">
          Cada fila es una carrera completa. El índice de Moloch resume cuánto bienestar
          perdió el grupo respecto a lo que podía haber conseguido.
        </p>
      </section>

      <div className="card scroll-x" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th style={{ paddingLeft: 22 }}>Desenlace</th>
              <th>Ganador</th>
              <th className="num">Jugadores</th>
              <th className="num">Rondas</th>
              <th className="num">Índice de Moloch</th>
              <th className="num">Integridad</th>
              <th style={{ paddingRight: 22 }} />
            </tr>
          </thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.game_id}>
                <td style={{ paddingLeft: 22 }}>
                  <span className={`tag ${KIND_CLASS[g.outcome_kind] ?? ""}`}>
                    {OUTCOME_LABEL[g.outcome_kind]}
                  </span>
                </td>
                <td style={{ color: "var(--text-dim)" }}>{g.winner_label ?? "—"}</td>
                <td className="num">{g.n_players}</td>
                <td className="num">{g.final_round}</td>
                <td className="num">
                  <span
                    style={{
                      color:
                        g.moloch_index > 0.66
                          ? "var(--fast)"
                          : g.moloch_index > 0.25
                            ? "var(--warn)"
                            : "var(--safe)",
                    }}
                  >
                    {g.moloch_index.toFixed(3)}
                  </span>
                </td>
                <td className="num">{Math.round(g.mean_integrity * 100)}%</td>
                <td className="num" style={{ paddingRight: 22 }}>
                  <Link href={`/arena/${g.game_id}`} className="btn" style={{ padding: "6px 12px" }}>
                    Ver →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {games.length === 0 && (
        <p className="note" style={{ marginTop: 20 }}>
          No hay partidas exportadas. Ejecuta <code>python -m moloch.cli run</code> y luego{" "}
          <code>python -m moloch.cli export</code> desde <code>backend/</code>.
        </p>
      )}
    </>
  );
}
