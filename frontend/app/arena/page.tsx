import { GameArchive } from "@/components/GameArchive";
import { getGames } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ArenaListPage() {
  const games = await getGames();
  return (
    <>
      <section style={{ marginTop: 44, marginBottom: 26 }}>
        <p className="eyebrow">Archivo de partidas</p>
        <h1 style={{ fontSize: 34 }}>Partidas</h1>
        <p className="lede">
          Encuentra una partida por modelo o riesgo. En cada repetición puedes ver las decisiones
          de cada ronda, cómo cambia el progreso y cómo se calcula el resultado final.
        </p>
      </section>
      <GameArchive games={games} />
    </>
  );
}
