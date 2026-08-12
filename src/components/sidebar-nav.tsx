"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { springDefault } from "@/lib/motion";
import { navItems, isNavItemActive } from "@/components/nav-items";

/**
 * A navegação em telas largas. Substitui a barra inferior a partir de `lg` —
 * as duas ficam montadas ao mesmo tempo, alternadas por CSS, então a pílula
 * daqui usa um `layoutId` próprio para o motion não tentar animá-la entre os
 * dois containers.
 */
export function SidebarNav() {
  const pathname = usePathname();

  return (
    <div
      data-slot="sidebar-nav"
      className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-8 border-r border-white/8 bg-card/70 px-4 py-6 backdrop-blur-xl backdrop-saturate-150 lg:flex"
    >
      <div className="flex items-center gap-2.5 px-3">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-primary" />
        <span className="font-heading font-semibold tracking-[-0.01em]">Finanças</span>
      </div>

      <nav aria-label="Navegação principal">
        <ul className="flex flex-col gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = isNavItemActive(href, pathname);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-nav-pill"
                      aria-hidden="true"
                      transition={springDefault}
                      className="absolute inset-0 -z-10 rounded-xl bg-primary/10"
                    />
                  )}
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
