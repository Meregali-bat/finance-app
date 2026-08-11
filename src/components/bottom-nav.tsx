"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CreditCard, PiggyBank, ListChecks, History } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { springDefault } from "@/lib/motion";

const items = [
  { href: "/", label: "Início", icon: Home },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/caixinhas", label: "Caixinhas", icon: PiggyBank },
  { href: "/rendas", label: "Fixos", icon: ListChecks },
  { href: "/historico", label: "Histórico", icon: History },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <>
      {/* O conteúdo se dissolve sob a barra em vez de encostar num divisor
          duro: a chrome flutua sobre a página, não corta uma faixa dela. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+3.5rem)] z-20 h-8 bg-linear-to-t from-background to-transparent"
      />
      <nav
        aria-label="Navegação principal"
        data-slot="bottom-nav"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-white/8 bg-card/70 shadow-nav backdrop-blur-xl backdrop-saturate-150 pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2">
          {items.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/rendas"
                ? pathname === "/rendas" || pathname === "/despesas"
                : pathname === href;
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-[3.5rem] flex-col items-center justify-center gap-1 py-2 text-[0.6875rem] font-medium transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      aria-hidden="true"
                      transition={springDefault}
                      className="absolute inset-x-1 inset-y-1 -z-10 rounded-xl bg-primary/10"
                    />
                  )}
                  <Icon
                    className={cn("size-5 transition-transform", isActive && "scale-110")}
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
