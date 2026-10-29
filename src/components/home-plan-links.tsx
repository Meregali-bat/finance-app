import Link from "next/link";
import { ChevronRight, Scale, Target } from "lucide-react";
import { SectionLabel } from "@/components/page-header";
import { PurchaseSimulationDialog } from "@/components/forms/purchase-simulation-dialog";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

/** Uma linha do grupo: ícone, nome, o valor que resume e a seta. */
const row =
  "group/plan flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-card-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

function RowBody({
  icon: Icon,
  label,
  value,
  valueClassName,
}: {
  icon: typeof Scale;
  label: string;
  value?: string;
  valueClassName?: string;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-muted text-primary"
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{label}</span>
      {value && (
        <span
          className={cn(
            "shrink-0 text-[13px] text-muted-foreground tabular-nums",
            valueClassName,
          )}
        >
          {value}
        </span>
      )}
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover/plan:translate-x-0.5"
      />
    </>
  );
}

/**
 * As ferramentas de planejar no celular, num grupo só. A Início do celular é
 * o número, o que lançar e o que pagar; simular e as fatias continuam a um
 * toque, sem os cards inteiros no caminho. No desktop os cards completos
 * ficam (esta lista é `lg:hidden` em quem a usa).
 *
 * O "a receber" não entra aqui: a lista dele, com o "Recebi", já vem no fim
 * da Início, nas duas larguras — uma linha de atalho só a repetia.
 */
export function HomePlanLinks({
  cards,
  categories,
  slicesConfigured,
  slicesOver,
  className,
  style,
}: {
  cards: Option[];
  categories: Option[];
  slicesConfigured: boolean;
  /** Quantas fatias de gastar já passaram do limite neste período. */
  slicesOver: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section aria-labelledby="planejar" className={cn("flex flex-col gap-3", className)} style={style}>
      <SectionLabel id="planejar">Planejar</SectionLabel>
      <ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-[20px] bg-card shadow-(--shadow-card)">
        {/* Sem cartão não há o que simular: a mesma regra do card do desktop. */}
        {cards.length > 0 && (
          <li>
            <PurchaseSimulationDialog
              cards={cards}
              categories={categories}
              trigger={{
                className: row,
                children: <RowBody icon={Scale} label="Posso comprar isso?" />,
              }}
            />
          </li>
        )}
        <li>
          <Link href="/metas" className={row}>
            {slicesConfigured ? (
              <RowBody
                icon={Target}
                label="Fatias do período"
                value={
                  slicesOver === 0
                    ? "dentro do limite"
                    : slicesOver === 1
                      ? "1 passou do limite"
                      : `${slicesOver} passaram do limite`
                }
                valueClassName={slicesOver > 0 ? "text-negative" : undefined}
              />
            ) : (
              <RowBody icon={Target} label="Divida a renda em fatias" />
            )}
          </Link>
        </li>
      </ul>
    </section>
  );
}
