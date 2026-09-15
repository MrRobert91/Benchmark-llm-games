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
          Explora las carreras V1 guardadas, filtra por modelo, riesgo o admisión y reproduce
          en 3D cada decisión SAFE/UNSAFE, pago de etapa, liderazgo y setback.
        </p>
      </section>
      <GameArchive games={games} />
    </>
  );
}
