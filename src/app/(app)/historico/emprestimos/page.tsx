import { ChevronDown, HandCoins } from "lucide-react";
import { requireUserId } from "@/lib/auth-helpers";
import { loadLoanReport, type LoanReportView } from "@/lib/loans-data";
import { formatCurrency } from "@/lib/format";
import { PageHeader, SectionLabel, StatLabel } from "@/components/page-header";
import { homeCard } from "@/components/home-card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

/** As quatro partes, sempre na mesma ordem e cor: voltou, perdido, em aberto. */
function Bar({ lent, repaid, forgiven, open }: { lent: number; repaid: number; forgiven: number; open: number }) {
  if (lent <= 0) return null;
  // O que voltou a mais (arredondou para cima) não estica a barra.
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / lent) * 100))}%`;
  return (
    <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-(--track)" aria-hidden="true">
      <div className="bg-positive" style={{ width: pct(Math.min(repaid, lent - forgiven)) }} />
      <div className="bg-foreground/45" style={{ width: pct(forgiven) }} />
      <div className="bg-primary" style={{ width: pct(open) }} />
    </div>
  );
}

function Numbers({ row }: { row: { lent: number; repaid: number; forgiven: number; open: number } }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
      {(
        [
          ["Emprestado", row.lent, null],
          ["Voltou", row.repaid, "bg-positive"],
          ["Perdido", row.forgiven, "bg-foreground/45"],
          ["Em aberto", row.open, "bg-primary"],
        ] as const
      ).map(([label, value, dot]) => (
        <div key={label} className="flex flex-col gap-0.5">
          <dt className="flex items-center gap-1.5">
            {dot && <span aria-hidden="true" className={cn("size-2 rounded-full", dot)} />}
            <StatLabel>{label}</StatLabel>
          </dt>
          <dd className="font-heading text-lg font-bold tabular-nums">{formatCurrency(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function loanStatus(l: LoanReportView["people"][number]["loans"][number]) {
  return [
    l.open > 0.005 ? `falta ${formatCurrency(l.open)}` : null,
    l.forgiven > 0.005 ? `${formatCurrency(l.forgiven)} perdido` : null,
    l.open <= 0.005 && l.forgiven <= 0.005 ? "pago" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * O relatório de empréstimos: quanto você emprestou para cada pessoa, quanto
 * voltou, quanto foi dado como perdido e quanto ainda está em aberto. Todo o
 * histórico, e não um período: um empréstimo costuma atravessar meses.
 */
export default async function LoanReportPage() {
  const userId = await requireUserId();
  const report = await loadLoanReport(userId);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 lg:gap-6">
      <PageHeader
        title="Empréstimos"
        subtitle="Quanto você emprestou, quanto voltou e quanto falta"
        backHref="/historico"
        backLabel="Voltar ao Histórico"
      />

      {report.people.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          text="Nenhum empréstimo lançado ainda."
          hint="Ao lançar um gasto, marque que foi emprestado para alguém."
        />
      ) : (
        <>
          <div className={homeCard("flex flex-col gap-4")}>
            <Numbers row={report.total} />
            <Bar {...report.total} />
          </div>

          <div className="flex flex-col gap-3">
            <SectionLabel>Por pessoa</SectionLabel>
            <ul className="flex flex-col gap-2.5">
              {report.people.map((person) => (
                <li key={person.personId}>
                  {/* Nativo, sem JavaScript: a pessoa abre os empréstimos e os
                      pagamentos dela. */}
                  <details className={homeCard("group/person flex flex-col gap-3")}>
                    <summary className="flex cursor-pointer list-none flex-col gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[15px] font-semibold">{person.name}</span>
                          <ChevronDown
                            aria-hidden="true"
                            className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/person:rotate-180"
                          />
                        </span>
                        <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
                          {person.open > 0.005 ? `em aberto ${formatCurrency(person.open)}` : "quitado"}
                        </span>
                      </span>
                      <span className="text-[13px] text-muted-foreground tabular-nums">
                        emprestou {formatCurrency(person.lent)} · voltou {formatCurrency(person.repaid)}
                        {person.forgiven > 0.005 ? ` · perdido ${formatCurrency(person.forgiven)}` : ""}
                      </span>
                      <Bar {...person} />
                    </summary>

                    <div className="flex flex-col gap-3 border-t border-(--hairline) pt-3">
                      <div className="flex flex-col gap-1.5">
                        <p className="text-[12.5px] font-semibold text-muted-foreground">Empréstimos</p>
                        <ul className="flex flex-col gap-2 text-[13px]">
                          {person.loans.map((loan) => (
                            <li key={loan.id} className="flex items-start justify-between gap-3">
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{loan.label}</span>
                                <span className="block text-muted-foreground tabular-nums">
                                  {loan.date} · {loanStatus(loan)}
                                </span>
                              </span>
                              <span className="shrink-0 tabular-nums">{formatCurrency(loan.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <p className="text-[12.5px] font-semibold text-muted-foreground">Pagamentos</p>
                        {person.repayments.length === 0 ? (
                          <p className="text-[13px] text-muted-foreground">Nenhum pagamento ainda.</p>
                        ) : (
                          <ul className="flex flex-col gap-1 text-[13px]">
                            {person.repayments.map((r, i) => (
                              <li key={i} className="flex justify-between gap-3 tabular-nums">
                                <span className="text-muted-foreground">{r.date}</span>
                                <span className="text-positive">+{formatCurrency(r.amount)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
