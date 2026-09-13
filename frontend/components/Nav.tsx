"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "El proyecto" },
  { href: "/arena", label: "Partidas" },
  { href: "/run", label: "Ejecutar" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden />
          Moloch Arena
        </Link>
        {LINKS.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} className="link" data-active={active}>
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
