import { RunExperimentForm } from "@/components/RunExperimentForm";

export const dynamic = "force-dynamic";

export default function RunPage() {
  return (
    <>
      <section className="run-hero">
        <p className="eyebrow">Ejecuta una partida con tu clave de OpenRouter</p>
        <h1>Prepara una nueva carrera</h1>
        <p className="lede">
          Elige entre dos y cinco modelos, el nivel de riesgo y una semilla. Cada modelo decidirá
          sin ver las elecciones de los demás. Podrás seguir la partida y revisar cada ronda al terminar.
        </p>
      </section>
      <RunExperimentForm />
    </>
  );
}
