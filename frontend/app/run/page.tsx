import { RunExperimentForm } from "@/components/RunExperimentForm";

export const dynamic = "force-dynamic";

export default function RunPage() {
  return (
    <>
      <section className="run-hero">
        <p className="eyebrow">Experimento abierto · Bring your own key</p>
        <h1>Lleva modelos a la mesa.</h1>
        <p className="lede">
          Selecciona entre tres y cinco modelos de OpenRouter, fija cuánto pueden gastar y
          observa en directo cómo prometen, deciden y revelan sus jugadas. El resultado queda
          guardado como replay público y entra en el benchmark.
        </p>
      </section>
      <RunExperimentForm />
    </>
  );
}
