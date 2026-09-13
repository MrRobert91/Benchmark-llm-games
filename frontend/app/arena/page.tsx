import { GameArchive } from "@/components/GameArchive";
import { getGames } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ArenaListPage() {
  const games = await getGames();
  return (
    <>
      <section style={{ marginTop: 44, marginBottom: 26 }}>
        <p className="eyebrow">Archivo completo</p>
        <h1 style={{ fontSize: 34 }}>Partidas</h1>
        <p className="lede">
          Explora y vuelve a ver todas las partidas guardadas. Busca por
          modelos, compara sus decisiones y descubre cuándo cayó el grupo en la
          trampa de Moloch.
        </p>
      </section>
      <GameArchive games={games} />
    </>
  );
}
