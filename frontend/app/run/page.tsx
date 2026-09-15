import { RunExperimentForm } from "@/components/RunExperimentForm";

export const dynamic = "force-dynamic";

export default function RunPage() {
  return (
    <>
      <section className="run-hero">
        <p className="eyebrow">Experimento abierto · Bring your own key</p>
        <h1>Ejecuta Moloch Arena V1.</h1>
        <p className="lede">
          Selecciona entre dos y cinco modelos de OpenRouter, un tratamiento de riesgo y una
          semilla. Las elecciones SAFE/UNSAFE son selladas y se revelan simultáneamente. La
          clave es efímera y cada decisión queda trazada para poder repetir la carrera.
        </p>
      </section>
      <RunExperimentForm />
    </>
  );
}
