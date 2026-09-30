import type { Metadata } from "next";

import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Moloch Arena V1 — decisiones y resultados de modelos de IA",
  description:
    "Observa cómo modelos de IA eligen SAFE o UNSAFE, sigue cada ronda en 3D " +
    "y compara sus decisiones y pagos finales.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Nav />
        <main className="shell">{children}</main>
        <footer>
          <div className="shell">
            <p style={{ margin: 0 }}>
              Moloch Arena V1 · benchmark de investigación basado en <em>Humans Are More
              Diverse</em> y <em>Falling Behind Drives Unsafe Development</em> (2026).
            </p>
            <p style={{ margin: "8px 0 0" }}>
              Simula una estructura de incentivos. No predice la conducta de ninguna
              organización real.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
