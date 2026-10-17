"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { springDefault } from "@/lib/motion";
import { navItems, isNavItemActive } from "@/components/nav-items";
import { Logo } from "@/components/logo";
import { ThemeSwitcher } from "@/components/theme-toggle";
import type { Theme } from "@/lib/theme";

/**
 * A navegação em telas largas. Substitui a barra inferior a partir de `lg` —
 * as duas ficam montadas ao mesmo tempo, alternadas por CSS, então a pílula
 * daqui usa um `layoutId` próprio para o motion não tentar animá-la entre os
 * dois containers.
 */
export function SidebarNav({ theme }: { theme: Theme }) {
  const pathname = usePathname();

  return (
    <div
      data-slot="sidebar-nav"
      className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-9 border-r border-border bg-(--sidebar-surface) px-4 py-7 backdrop-blur-[24px] backdrop-saturate-150 lg:flex"
    >
      <Logo className="px-2.5" />

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
                    "relative flex h-11 items-center gap-3 rounded-[14px] px-3 text-sm font-medium transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-nav-pill"
                      aria-hidden="true"
                      transition={springDefault}
                      className="absolute inset-0 -z-10 rounded-[14px] bg-primary/10 ring-1 ring-primary/15 ring-inset"
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

      <ThemeSwitcher initial={theme} className="mt-auto" />
    </div>
  );
}
