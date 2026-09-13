import type { Metadata } from "next";

import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Moloch Arena — benchmark de carrera armamentística para LLMs",
  description:
    "Varios modelos compiten por una tecnología transformadora. Deliberan en público y " +
    "actúan en privado. Se mide si el grupo cae en la trampa multipolar y quién cumple " +
    "su palabra.",
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
              Moloch Arena · benchmark de investigación. Las reglas derivan del modelo de
              carrera idealizada de Han, Pereira y Lenaerts y del diseño conductual de{" "}
              <em>Falling Behind Drives Unsafe Development</em> (2026).
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
