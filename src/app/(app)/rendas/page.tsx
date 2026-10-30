import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { formatCurrency, formatShortDate } from "@/lib/format";
import Link from "next/link";
import { dateForDayInMonth, getPeriodBounds, installmentsLeft, storedDay } from "@/lib/period";
import { EmptyState } from "@/components/ui/empty-state";
import { FixedTabs, type FixedTab } from "@/components/fixed-tabs";
import { ListRow, SubtitleParts, stagger } from "@/components/list-row";
import { StatLabel } from "@/components/page-header";
import { IncomeFormDialog } from "@/components/forms/income-form-dialog";
import { ExpenseFormDialog } from "@/components/forms/expense-form-dialog";
import { CategoryFormDialog } from "@/components/forms/category-form-dialog";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { deleteIncome, toggleIncomeActive } from "@/lib/actions/income";
import {
  deleteFixedExpense,
  toggleFixedExpenseActive,
  undoExpenseDeferral,
} from "@/lib/actions/expense";
import { deleteCategory, toggleCategoryActive } from "@/lib/actions/category";
import { cn } from "@/lib/utils";

/** O estado de uma linha e quanto ele pede atenção. */
type RowState = { text: string; tone?: "overdue" | "soon" };

const FIXED_TABS: readonly FixedTab[] = ["rendas", "despesas", "categorias"];

/** `?aba=despesas` abre direto na aba; qualquer outra coisa, em Rendas. */
function resolveTab(param: string | string[] | undefined): FixedTab {
  const raw = Array.isArray(param) ? param[0] : param;
  return FIXED_TABS.find((tab) => tab === raw) ?? "rendas";
}

/** "08/11" — o ano só atrapalha numa data deste mês ou do próximo. */
function dayMonth(date: Date) {
  return formatShortDate(date).slice(0, 5);
}

const sameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

export default async function FixedPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string | string[] }>;
}) {
  const userId = await requireUserId();
  const { aba } = await searchParams;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const recent = new Date(today.getTime() - 45 * 86_400_000);

  const [incomes, receipts, expenses, creditCards, categories] = await Promise.all([
    prisma.income.findMany({ where: { userId, deletedAt: null }, orderBy: { dayOfMonth: "asc" } }),
    // As confirmações recentes: dizem se a renda deste mês já chegou.
    prisma.incomeReceipt.findMany({
      where: { userId, occurrenceDate: { gte: recent } },
      select: { incomeId: true, occurrenceDate: true, amount: true },
    }),
    // As apagadas ficam no banco para o Histórico, mas não na lista.
    prisma.fixedExpense.findMany({
      where: { userId, deletedAt: null },
      orderBy: { dueDay: "asc" },
      include: {
        deferrals: { orderBy: { dueDate: "asc" } },
        // Os pagos de agora para a frente: a parcela adiantada já não falta.
        payments: {
          where: { settled: true, dueDate: { gte: new Date(today.getTime() - 40 * 86_400_000) } },
          select: { dueDate: true, paidAt: true },
        },
        pauses: { where: { endedAt: null }, select: { startedAt: true } },
      },
    }),
    prisma.creditCard.findMany({ where: { userId, active: true, deletedAt: null } }),
    prisma.category.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      include: { _count: { select: { transactions: true, cardPurchases: true, fixedExpenses: true } } },
    }),
  ]);

  // O ciclo de pagamento de agora, o mesmo da Início e da Previsão: o estado de
  // cada linha é o deste ciclo, não o do mês do calendário.
  const { periodStart, periodEnd } = getPeriodBounds(
    incomes.map((i) => ({
      id: i.id,
      amount: Number(i.amount),
      dayOfMonth: i.dayOfMonth,
      createdAt: i.createdAt,
      active: i.active,
    })),
    today,
    receipts.map((r) => ({
      incomeId: r.incomeId,
      occurrenceDate: r.occurrenceDate,
      amount: Number(r.amount),
    })),
  );
  /** Os vencimentos de um dia do mês dentro do ciclo, e o primeiro depois dele. */
  function dueDatesInCycle(day: number) {
    const dates: Date[] = [];
    for (let offset = -1; offset <= 2; offset++) {
      const d = dateForDayInMonth(periodStart.getFullYear(), periodStart.getMonth() + offset, day);
      if (d.getTime() >= periodStart.getTime() && d.getTime() < periodEnd.getTime()) dates.push(d);
    }
    let next = dateForDayInMonth(periodEnd.getFullYear(), periodEnd.getMonth(), day);
    if (next.getTime() < periodEnd.getTime())
      next = dateForDayInMonth(periodEnd.getFullYear(), periodEnd.getMonth() + 1, day);
    return { dates, next };
  }

  const cards = creditCards.map((c) => ({ id: c.id, name: c.name }));
  // A aba Categorias lista todas para gerenciar; os formulários só oferecem as ativas.
  const activeCategories = categories
    .filter((c) => c.active)
    .map((c) => ({ id: c.id, name: c.name }));
  const cardNameById = new Map(cards.map((c) => [c.id, c.name]));
  const cardDueById = new Map(creditCards.map((c) => [c.id, c.dueDay]));

  const rows = expenses.map((expense) => {
    // Quantas faltam, e não o número salvo: é o que a pessoa confere com o
    // carnê, e o que o formulário edita.
    const left = installmentsLeft(
      {
        dueDay: expense.dueDay ?? undefined,
        createdAt: expense.createdAt,
        installmentCount: expense.installmentCount ?? undefined,
        installmentsFrom: expense.installmentsFrom ?? undefined,
      },
      today,
      expense.payments.map((p) => p.dueDate),
    );
    // Só os adiamentos que ainda vão cobrar: os que já passaram são história,
    // e desfazê-los trazia de volta uma conta vencida.
    const deferrals = expense.deferrals.filter(
      (d) => storedDay(d.targetDueDate).getTime() >= todayStart.getTime(),
    );
    const afterLast = deferrals.filter((d) => d.mode === "end");
    return { expense, left, deferrals, afterLast, ended: left?.remaining === 0 && afterLast.length === 0 };
  });

  /**
   * Como está a despesa neste ciclo: a primeira cobrança que falta (vencida,
   * adiada ou por vencer); paga, se todas foram; ou a próxima, se nenhuma cai
   * nele.
   */
  function expenseState(row: (typeof rows)[number]): RowState | null {
    const { expense, deferrals } = row;
    if (!expense.active) {
      const since = expense.pauses[0]?.startedAt;
      return { text: since ? `pausada desde ${dayMonth(since)}` : "pausada" };
    }
    if (row.ended) return null;
    if (expense.cardId) {
      const due = cardDueById.get(expense.cardId);
      return { text: due ? `na fatura que vence dia ${due}` : "na fatura do cartão" };
    }
    if (expense.dueDay == null) return null;
    const { dates, next } = dueDatesInCycle(expense.dueDay);
    const paidFor = (due: Date) => expense.payments.find((p) => sameMonth(storedDay(p.dueDate), due));
    const open = dates.find((due) => !paidFor(due));
    if (open) {
      const deferred = deferrals.find((d) => sameMonth(storedDay(d.dueDate), open));
      if (deferred) return { text: `adiada para ${dayMonth(storedDay(deferred.targetDueDate))}` };
      const days = Math.round((open.getTime() - todayStart.getTime()) / 86_400_000);
      if (days < 0) return { text: `venceu ${dayMonth(open)}`, tone: "overdue" };
      return {
        text: days === 0 ? "vence hoje" : `vence ${dayMonth(open)}`,
        tone: days <= 3 ? "soon" : undefined,
      };
    }
    const paid = dates.length > 0 ? paidFor(dates.at(-1)!) : undefined;
    return {
      text: paid
        ? `paga em ${dayMonth(paid.paidAt)} · próxima ${dayMonth(next)}`
        : `próxima ${dayMonth(next)}`,
    };
  }

  /** O estado numa linha só dele: vencida em vermelho, perto de vencer em destaque. */
  const stateLine = (state: RowState) => (
    <span
      className={cn(
        "block",
        state.tone === "overdue" && "font-medium text-negative",
        state.tone === "soon" && "font-medium text-foreground",
      )}
    >
      <SubtitleParts text={state.text} />
    </span>
  );

  /** Como está a renda neste ciclo: recebida (e quando vem a próxima), a confirmar ou por chegar. */
  function incomeState(income: (typeof incomes)[number]): string {
    if (!income.active) return "pausada";
    const { dates, next } = dueDatesInCycle(income.dayOfMonth);
    // A confirmação guarda o dia em que o dinheiro chegou, que pode ser antes
    // do dia do pagamento (o salário do 15 que caiu no 5).
    const receipt = receipts
      .filter((r) => r.incomeId === income.id && r.occurrenceDate.getTime() >= periodStart.getTime())
      .at(-1);
    if (receipt) return `recebida em ${dayMonth(receipt.occurrenceDate)} · próxima ${dayMonth(next)}`;
    const payday = dates[0] ?? next;
    return payday.getTime() < todayStart.getTime()
      ? `a confirmar desde ${dayMonth(payday)}`
      : `chega ${dayMonth(payday)}`;
  }

  // O mês fixo de uma vez: o que entra, o que sai e o que sobra — a mesma
  // soma que a Previsão faz antes do gasto do dia a dia.
  const activeIncomes = incomes.filter((i) => i.active);
  const incomeTotal = activeIncomes.reduce((sum, i) => sum + Number(i.amount), 0);
  const charging = rows.filter((r) => r.expense.active && !r.ended);
  const accountTotal = charging
    .filter((r) => !r.expense.cardId)
    .reduce((sum, r) => sum + Number(r.expense.amount), 0);
  const cardTotal = charging
    .filter((r) => r.expense.cardId)
    .reduce((sum, r) => sum + Number(r.expense.amount), 0);
  const fixedLeft = incomeTotal - accountTotal - cardTotal;

  const summary = (
    // Uma linha por número no celular: em três colunas de 120px o valor
    // cortava ("R$ 5.700,..."), e dinheiro cortado não serve.
    <div className="grid overflow-hidden rounded-[20px] bg-muted shadow-(--shadow-card) sm:grid-cols-3">
      {[
        { label: "Rendas", value: incomeTotal, tone: "text-positive", note: "por mês" },
        {
          label: "Despesas",
          value: accountTotal + cardTotal,
          tone: "",
          note:
            cardTotal >= 0.005
              ? `${formatCurrency(cardTotal)} no cartão`
              : "por mês",
        },
        {
          label: "Sobra fixa",
          value: fixedLeft,
          tone: fixedLeft < 0 ? "text-negative" : "",
          // Não é o que sobra no ciclo: as compras do cartão (parcelas, o dia
          // a dia) ficam de fora. Quem diz isso é a Previsão.
          note: "fora as compras no cartão",
          href: "/previsao",
        },
      ].map((figure) => (
        <div
          key={figure.label}
          className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 px-4 py-2.5 shadow-[0_-1px_0_0_var(--hairline)] sm:flex sm:flex-col sm:gap-0.5 sm:py-3 sm:shadow-[-1px_0_0_0_var(--hairline)] lg:px-5 lg:py-4"
        >
          <StatLabel>{figure.label}</StatLabel>
          <p
            className={cn(
              "font-heading text-[17px] leading-tight font-bold tracking-[-0.03em] tabular-nums sm:order-none lg:text-xl",
              figure.tone,
            )}
          >
            {formatCurrency(figure.value)}
          </p>
          <p className="col-span-2 text-[11.5px] text-muted-foreground tabular-nums">
            {figure.note}
            {"href" in figure && figure.href && (
              <>
                {" · "}
                <Link
                  href={figure.href}
                  className="font-semibold text-foreground underline decoration-border underline-offset-2 hover:decoration-current"
                >
                  o ciclo na Previsão
                </Link>
              </>
            )}
          </p>
        </div>
      ))}
    </div>
  );

  const onlyActiveIncome = activeIncomes.length === 1 ? activeIncomes[0].id : null;

  const expenseItem = (row: (typeof rows)[number], index: number) => {
    const { expense, left, deferrals, afterLast } = row;
    const state = expenseState(row);
    const cardName = expense.cardId ? cardNameById.get(expense.cardId) : undefined;
    // Uma parcela adiada para depois da última também falta, e é ela a última.
    const lastDeferred = afterLast.at(-1)?.targetDueDate;
    const installments =
      left &&
      (row.ended
        ? "parcelas encerradas"
        : // A adiada para depois da última já está no aviso de baixo e na
          // data da última: repetir "+ 1 adiada" aqui só alongava a linha.
          `${left.remaining === 1 ? "falta 1 parcela" : `faltam ${left.remaining} parcelas`} · última em ${formatShortDate(lastDeferred ?? left.last)}`);
    return (
      <li key={expense.id} className="rise-in" style={stagger(index, 80, 45)}>
        <ListRow
          dim={!expense.active}
          title={expense.label}
          value={formatCurrency(Number(expense.amount))}
          // Onde sai e as parcelas em cima; o estado numa linha só dele, que é
          // o que se procura. "todo dia N" só quando não há data nenhuma.
          subtitle={
            <>
              <SubtitleParts
                text={[cardName ?? (state && expense.active ? null : `todo dia ${expense.dueDay}`), installments]
                  .filter(Boolean)
                  .join(" · ")}
              />
              {state && stateLine(state)}
            </>
          }
          trailing={
            <>
              <ToggleActiveButton
                active={expense.active}
                label={`${expense.label} em vigor`}
                titles={{ on: "Pausar: sai dos próximos ciclos", off: "Retomar" }}
                doneText={{
                  off: `${expense.label} pausada: sai dos ciclos a partir de hoje`,
                  on: `${expense.label} de volta aos ciclos`,
                }}
                onToggle={toggleFixedExpenseActive.bind(null, expense.id)}
              />
              <ExpenseFormDialog
                expense={{
                  id: expense.id,
                  label: expense.label,
                  amount: Number(expense.amount),
                  dueDay: expense.dueDay,
                  cardId: expense.cardId,
                  categoryId: expense.categoryId,
                  installmentCount: left ? left.remaining : expense.installmentCount,
                  deferredAfterLast: afterLast.length,
                }}
                cards={cards}
                categories={activeCategories}
              />
              <DeleteIconButton
                action={deleteFixedExpense.bind(null, expense.id)}
                itemLabel={expense.label}
                confirmMessage={`Excluir a despesa "${expense.label}"? Ela para de ser cobrada daqui para frente; os meses em que já foi cobrada continuam no Histórico.`}
              />
            </>
          }
        >
          {/* Um adiamento não é dinheiro e não aparece no Histórico; é aqui
              que ele se vê e se desfaz. */}
          {deferrals.map((deferral) => {
            const from = dayMonth(storedDay(deferral.dueDate));
            const overdue = storedDay(deferral.dueDate).getTime() < todayStart.getTime();
            return (
              <div
                key={deferral.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-muted py-1 pr-1 pl-3 text-xs text-muted-foreground"
              >
                <span className="tabular-nums">
                  Adiada: {from} → {dayMonth(storedDay(deferral.targetDueDate))} (
                  {formatCurrency(Number(deferral.amount))}
                  {deferral.mode === "end" ? ", depois da última" : ""})
                </span>
                <DeleteIconButton
                  undo
                  itemLabel={`adiamento de ${from}`}
                  title="Desfazer adiamento"
                  action={undoExpenseDeferral.bind(null, deferral.id)}
                  confirmMessage={
                    overdue
                      ? `Desfazer o adiamento? A cobrança de ${from} volta para o dia dela e fica vencida — e não dá para adiar de novo depois do vencimento.`
                      : `Desfazer o adiamento? A cobrança volta para ${from}.`
                  }
                />
              </div>
            );
          })}
        </ListRow>
      </li>
    );
  };

  // As de parcelas encerradas no fim: não cobram mais nada.
  const byEnded = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    Number(a.ended) - Number(b.ended);
  const onAccount = rows.filter((r) => !r.expense.cardId).sort(byEnded);
  const onCard = rows.filter((r) => r.expense.cardId).sort(byEnded);

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <FixedTabs
        initialTab={resolveTab(aba)}
        summary={summary}
        actions={{
          rendas: <IncomeFormDialog />,
          despesas: <ExpenseFormDialog cards={cards} categories={activeCategories} />,
          categorias: <CategoryFormDialog />,
        }}
        panels={{
          rendas:
            incomes.length === 0 ? (
              <EmptyState text="Nenhuma renda cadastrada ainda." hint="Use o + para cadastrar." />
            ) : (
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 xl:grid-cols-2">
                {incomes.map((income, index) => (
                  <li key={income.id} className="rise-in" style={stagger(index, 80, 45)}>
                    <ListRow
                      dim={!income.active}
                      title={income.label}
                      value={formatCurrency(Number(income.amount))}
                      valueClassName={income.active ? "text-positive" : undefined}
                      subtitle={incomeState(income)}
                      trailing={
                        <>
                          <ToggleActiveButton
                            active={income.active}
                            label={`${income.label} em vigor`}
                            titles={{ on: "Pausar: sai dos próximos ciclos", off: "Retomar" }}
                            doneText={{
                              off: `${income.label} pausada: deixa de ser prevista`,
                              on: `${income.label} de volta à previsão`,
                            }}
                            // A única renda marca o ciclo: sem ela, a Início e
                            // a Previsão perdem o período. Pergunta antes.
                            confirmOff={
                              income.id === onlyActiveIncome
                                ? {
                                    title: `Pausar ${income.label}?`,
                                    description:
                                      "É a única renda ativa: sem ela, a Início e a Previsão ficam sem dia de pagamento para fechar o período, e o número do dia passa a valer só até amanhã.",
                                  }
                                : undefined
                            }
                            onToggle={toggleIncomeActive.bind(null, income.id)}
                          />
                          <IncomeFormDialog
                            income={{
                              id: income.id,
                              label: income.label,
                              amount: Number(income.amount),
                              dayOfMonth: income.dayOfMonth,
                            }}
                          />
                          <DeleteIconButton
                            action={deleteIncome.bind(null, income.id)}
                            itemLabel={income.label}
                            confirmMessage={`Excluir a renda "${income.label}"? Ela deixa de ser prevista; o que ela já pagou continua no Histórico e no saldo.`}
                          />
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
            ),
          despesas:
            expenses.length === 0 ? (
              <EmptyState
                text="Nenhuma despesa fixa cadastrada ainda."
                hint="Use o + para cadastrar."
              />
            ) : (
              // Separadas por onde saem: as da conta vencem num dia, as do
              // cartão entram na fatura.
              <div className="flex flex-col gap-5">
                {[
                  { key: "conta", label: "Na conta", list: onAccount, total: accountTotal },
                  { key: "cartao", label: "No cartão", list: onCard, total: cardTotal },
                ]
                  .filter((group) => group.list.length > 0)
                  .map((group, groupIndex) => (
                    <section key={group.key} className="flex flex-col gap-2">
                      <h2 className="flex items-baseline justify-between gap-3 px-1 text-[13px] font-semibold text-muted-foreground">
                        {group.label}
                        <span className="tabular-nums">{formatCurrency(group.total)} por mês</span>
                      </h2>
                      {/* Uma coluna: em duas, a linha com adiamento abria um buraco
                          ao lado e a ordem dos vencimentos ziguezagueava. */}
                      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
                        {group.list.map((row, index) =>
                          expenseItem(row, index + groupIndex * onAccount.length),
                        )}
                      </ul>
                    </section>
                  ))}
              </div>
            ),
          categorias:
            categories.length === 0 ? (
              <EmptyState
                text="Nenhuma categoria cadastrada ainda."
                hint="Use o + para cadastrar."
              />
            ) : (
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 xl:grid-cols-2">
                {/* As desativadas por último: no meio da lista, uma apagada entre
                    as ativas parecia um erro de desenho. */}
                {categories
                  .map((category) => ({
                    category,
                    uses:
                      category._count.transactions +
                      category._count.cardPurchases +
                      category._count.fixedExpenses,
                  }))
                  // As mais usadas primeiro, que são as que se procuram.
                  .sort((a, b) => Number(b.category.active) - Number(a.category.active) || b.uses - a.uses)
                  .map(({ category, uses }, index) => {
                    return (
                      <li key={category.id} className="rise-in" style={stagger(index, 80, 45)}>
                        <ListRow
                          dim={!category.active}
                          title={category.name}
                          subtitle={[
                            uses === 0 ? "sem uso" : uses === 1 ? "1 lançamento" : `${uses} lançamentos`,
                            !category.active && "desativada: some dos formulários",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                          trailing={
                            <>
                              <ToggleActiveButton
                                active={category.active}
                                label={`${category.name} em uso`}
                                titles={{ on: "Desativar: some dos formulários", off: "Ativar" }}
                                doneText={{
                                  off: `${category.name} desativada: some dos formulários`,
                                  on: `${category.name} de volta aos formulários`,
                                }}
                                onToggle={toggleCategoryActive.bind(null, category.id)}
                              />
                              <CategoryFormDialog
                                category={{ id: category.id, name: category.name }}
                                uses={uses}
                              />
                              {/* Só a vazia se exclui. A lixeira apagada em toda linha em uso virava
                                  ruído; o porquê fica no editar. */}
                              {uses === 0 && (
                                <DeleteIconButton
                                  action={deleteCategory.bind(null, category.id)}
                                  itemLabel={category.name}
                                  confirmMessage={`Excluir a categoria "${category.name}"? Ela não está em nenhum lançamento.`}
                                />
                              )}
                            </>
                          }
                        />
                      </li>
                    );
                  })}
              </ul>
            ),
        }}
      />
    </div>
  );
}
