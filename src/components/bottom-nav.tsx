"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { springDefault } from "@/lib/motion";
import { navItems, isNavItemActive } from "@/components/nav-items";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <>
      {/* O conteúdo se dissolve sob a barra em vez de encostar num divisor
          duro: a chrome flutua sobre a página, não corta uma faixa dela. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+3.625rem)] z-20 h-8 bg-linear-to-t from-background to-transparent lg:hidden"
      />
      <nav
        aria-label="Navegação principal"
        data-slot="bottom-nav"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-white/[0.07] bg-[rgb(27_17_16/0.75)] shadow-nav backdrop-blur-[24px] backdrop-saturate-150 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = isNavItemActive(href, pathname);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-[58px] flex-col items-center justify-center gap-1 py-2 text-[10.5px] font-semibold transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      aria-hidden="true"
                      transition={springDefault}
                      className="absolute inset-x-1 inset-y-1 -z-10 rounded-[14px] bg-primary/10 shadow-[inset_0_0_0_1px_rgb(242_169_159/0.14)]"
                    />
                  )}
                  <Icon
                    className={cn("size-[21px] transition-transform", isActive && "scale-110")}
                    aria-hidden="true"
                  />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
