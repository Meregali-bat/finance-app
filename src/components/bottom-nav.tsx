"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CreditCard, PiggyBank, ListChecks, History } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
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
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors",
                  "min-h-[44px] justify-center",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
