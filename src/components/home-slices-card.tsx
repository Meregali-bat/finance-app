import Link from "next/link";
import { ChevronRight, Target } from "lucide-react";
import { homeCard } from "@/components/home-card";
import { SectionLabel } from "@/components/page-header";
import { formatCurrency } from "@/lib/format";
import { SLICES, type SavingReserve, type SliceUsage } from "@/lib/slices";
import { cn } from "@/lib/utils";

/**
 * As fatias na Início: no celular é a porta de entrada das Metas. Uma barra
 * por fatia de gastar e a linha do guardado; sem fatias configuradas, o
 * convite para configurar.
 */
export function HomeSlicesCard({
  configured,
  usage,
  savings,
  className,
  style,
}: {
  configured: boolean;
  usage: SliceUsage[];
  savings: SavingReserve | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!configured) {
    return (
      <Link
        href="/metas"
        className={homeCard(
          cn(
            "group/row flex items-center justify-between gap-4 transition-colors duration-150 hover:bg-card-hover",
            className,
          ),
        )}
        style={style}
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <SectionLabel>Divida a renda em fatias</SectionLabel>
          <p className="text-sm text-muted-foreground">
            Custos fixos, conforto, prazeres, conhecimento e o que guardar — cada um com sua parte.
          </p>
        </div>
        <Target
          className="size-5 shrink-0 text-primary transition-transform duration-150 group-hover/row:translate-x-0.5"
          aria-hidden="true"
        />
      </Link>
    );
  }

  const spending = SLICES.filter((s) => !s.saving);
  const byKey = new Map(usage.map((u) => [u.key, u]));
  return (
    <Link
      href="/metas"
      className={homeCard(
        cn(
          "group/row flex flex-col gap-3 transition-colors duration-150 hover:bg-card-hover",
          className,
        ),
      )}
      style={style}
    >
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Fatias do período</SectionLabel>
        <ChevronRight
          className="size-4 text-muted-foreground/60 transition-transform duration-150 group-hover/row:translate-x-0.5"
          aria-hidden="true"
        />
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {spending.map((slice) => {
          const u = byKey.get(slice.key);
          const pct = u?.percentUsed ?? 0;
          return (
            <li key={slice.key} className="flex flex-col gap-1">
              <span className="flex items-center justify-between gap-2 text-[12.5px]">
                <span className="truncate text-muted-foreground">{slice.name}</span>
                <span className={cn("tabular-nums font-medium", pct > 100 && "text-negative")}>
                  {Math.round(pct)}%
                  {/* A barra e o vermelho só se veem; o card inteiro é um link,
                      então o significado vai como texto dentro dele, e não
                      como um progressbar, que o nome do link achataria. */}
                  <span className="sr-only">
                    {pct > 100 ? " do limite usado, passou do limite" : " do limite usado"}
                  </span>
                </span>
              </span>
              <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-(--track)">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    background: pct > 100 ? "var(--negative)" : slice.color,
                  }}
                />
              </span>
            </li>
          );
        })}
      </ul>
      {savings && (
        <p className="text-[12.5px] text-muted-foreground tabular-nums">
          Guardado {formatCurrency(savings.saved)} de {formatCurrency(savings.target)}
        </p>
      )}
    </Link>
  );
}
