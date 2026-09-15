import type { Metadata } from "next";

import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Moloch Arena V1 — benchmark reproducible de carreras de IA",
  description:
    "Modelos eligen SAFE o UNSAFE bajo un horizonte incierto. Compara tasa UNSAFE, " +
    "payoff, liderazgo y setback con trazabilidad SQLite y replay 3D.",
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
