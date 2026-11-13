"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { springDefault } from "@/lib/motion";
import { navItems, isNavItemActive } from "@/components/nav-items";
import { Logo, LogoMark } from "@/components/logo";
import { UserAvatar } from "@/components/user-avatar";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";

/**
 * A navegação em telas largas. Substitui a barra inferior a partir de `lg` —
 * as duas ficam montadas ao mesmo tempo, alternadas por CSS, então a pílula
 * daqui usa um `layoutId` próprio para o motion não tentar animá-la entre os
 * dois containers.
 *
 * Recolhível: só os ícones, para dar a largura à tela. A escolha fica num
 * cookie do aparelho, lido pelo layout no servidor — assim a barra já chega
 * do tamanho certo, sem pular depois de carregar.
 */
export function SidebarNav({
  user,
  initialCollapsed = false,
}: {
  user: { name: string | null; email: string; avatar: string | null };
  initialCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    // Um ano; `lax` basta: é só uma preferência de tela.
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  }

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <div
      data-slot="sidebar-nav"
      data-collapsed={collapsed || undefined}
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col gap-9 border-r border-border bg-(--sidebar-surface) py-7 backdrop-blur-[24px] backdrop-saturate-150 transition-[width,padding] duration-200 ease-out-quint lg:flex",
        collapsed ? "w-[76px] px-3" : "w-[248px] px-4",
      )}
    >
      <div className={cn("flex items-center", collapsed ? "flex-col gap-4" : "justify-between")}>
        {collapsed ? (
          <Link href="/" aria-label="Leeway, Início" className="flex size-11 items-center justify-center">
            <LogoMark size={28} animated={false} />
          </Link>
        ) : (
          <Logo className="px-2.5" />
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className="flex size-9 items-center justify-center rounded-[10px] text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-[0.94]"
        >
          <ToggleIcon className="size-[18px]" aria-hidden="true" />
        </button>
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
                  // Recolhida, o nome vira dica e rótulo acessível.
                  aria-label={collapsed ? label : undefined}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "relative flex h-11 items-center gap-3 rounded-[14px] text-sm font-medium transition-colors",
                    collapsed ? "justify-center px-0" : "px-3",
                    isActive ? "font-semibold text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-nav-pill"
                      aria-hidden="true"
                      transition={springDefault}
                      className="absolute inset-0 -z-10 rounded-[14px] bg-primary/14"
                    />
                  )}
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  {!collapsed && label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* No pé, quem está usando: leva ao Perfil, onde ficam o nome, a foto e o tema. */}
      <Link
        href="/perfil"
        aria-current={pathname === "/perfil" ? "page" : undefined}
        aria-label={collapsed ? "Perfil e aparência" : undefined}
        title={collapsed ? "Perfil e aparência" : undefined}
        className={cn(
          "mt-auto flex items-center gap-3 rounded-[14px] p-2 transition-colors hover:bg-muted",
          collapsed && "justify-center",
          pathname === "/perfil" && "bg-primary/14",
        )}
      >
        <UserAvatar name={user.name} email={user.email} src={user.avatar} className="size-9" />
        {!collapsed && (
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{user.name ?? "Seu perfil"}</span>
            <span className="truncate text-[12px] text-muted-foreground">
              {user.name ? "Perfil e aparência" : user.email}
            </span>
          </span>
        )}
      </Link>
    </div>
  );
}
