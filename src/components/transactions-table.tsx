"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { iconButton } from "@/components/ui/icon-button";
import { homeCard } from "@/components/home-card";
import { MovementFormDialog } from "@/components/forms/movement-form-dialog";
import { DeleteIconButton } from "@/components/delete-icon-button";
import { itemDayKey, toMovementValues, historyItemKey, type HistoryItem } from "@/lib/history-item";
import { useHistoryDay } from "@/components/history-day";
import { countsAsSpending } from "@/lib/report-totals";
import { bulkDelete, bulkSetCategory, setItemCategory, setItemSlice } from "@/lib/actions/slices";
import { unmarkExpensePayment } from "@/lib/actions/expense-payment";
import { unmarkIncomeReceived } from "@/lib/actions/income-receipt";
import { SLICES, isSliceKey, type SliceKey } from "@/lib/slices";
import { errorMessage } from "@/lib/error-message";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type Category = { id: string; name: string; slice: SliceKey };
type SortKey = "date" | "description" | "amount";

const PAGE = 25;
const AUTO = "__auto__";
const NONE = "__none__";
const ALL = "__all__";
const ACCOUNT = "__account__";

const spendingSlices = SLICES.filter((s) => !s.saving);
const sliceInfo = (key: string | null | undefined) => SLICES.find((s) => s.key === key);

/** Só lançamentos e compras se editam na linha; o resto vem de outras telas. */
const editable = (item: HistoryItem) => item.kind === "transaction" || item.kind === "card";
const incoming = (item: HistoryItem) =>
  item.amount < 0 && item.kind !== "jarDeposit" && item.kind !== "cardBillAdjustment";
/** Guardar e resgatar só trocam o dinheiro de lugar: não são entrada nem saída. */
const transfer = (item: HistoryItem) => item.kind === "jarDeposit";
/**
 * A fatura paga: o dinheiro sai da conta, mas as compras dela já contam uma a
 * uma. Vista como mais uma saída, ela somava duas vezes na cabeça de quem lê.
 */
const billPayment = (item: HistoryItem) => item.kind === "cardBillPayment";

/** Por que a linha não se edita aqui, e de onde ela vem. */
const ORIGIN: Partial<Record<HistoryItem["kind"], string>> = {
  cardBillPayment: "fatura paga; as compras dela já contam uma a uma",
  fixedExpensePayment: "conta fixa paga",
  incomeReceipt: "renda confirmada",
  cardFixedExpense: "assinatura no cartão, edite em Fixos",
  cardEstimate: "previsão na fatura, edite no cartão",
  cardBillAdjustment: "diferença da fatura paga",
};

/** A segunda linha da descrição: parcela, empréstimo e origem. */
function rowNote(item: HistoryItem) {
  return [
    item.kind === "card" && item.installments && item.installments > 1
      ? item.installmentNumber
        ? `parcela ${item.installmentNumber}/${item.installments}`
        : `em ${item.installments}x`
      : null,
    // A data da linha é a da compra; a fatura que cobra a parcela vem aqui.
    item.kind === "card" && item.installmentNumber ? `fatura ${billDayLabel(item.date)}` : null,
    item.lentTo ? `emprestado a ${item.lentTo}` : null,
    ORIGIN[item.kind] ?? null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Lançamentos e compras inteiras guardam o dia em UTC; confirmações e
 *  parcelas (pelo vencimento da fatura), instantes locais. */
const storedInUtc = (item: HistoryItem) =>
  item.kind === "transaction" || (item.kind === "card" && !item.installmentNumber);

/** "2026-10-21", o dia que a linha mostra: a ordem por data segue ele, e não
 *  o instante, que mistura meia-noite UTC com hora local. */
function shownDayKey(item: HistoryItem) {
  // A compra no cartão pelo dia em que foi feita, como no calendário: pelo
  // vencimento, doze compras de setembro liam todas "25/09".
  if (item.kind === "card" && item.purchaseDate) return item.purchaseDate.toISOString().slice(0, 10);
  const d = item.date;
  return storedInUtc(item)
    ? d.toISOString().slice(0, 10)
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(item: HistoryItem) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${shownDayKey(item)}T00:00:00.000Z`));
}

/** "25/10": o vencimento da fatura, um instante local. */
function billDayLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

/** "2026-10-21" → "21 de out", lido como dia de calendário. */
function dayChipLabel(key: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${key}T00:00:00.000Z`))
    .replace(".", "");
}

function accountOf(item: HistoryItem) {
  if (item.kind === "cardBillPayment" && item.cardName) return `Conta → ${item.cardName}`;
  if (item.cardName) return item.cardName;
  // O sentido, que o valor sem sinal não diz: guardar tira da conta, resgatar põe.
  if (item.kind === "jarDeposit") return item.amount < 0 ? "Caixinha → Conta" : "Conta → Caixinha";
  return "Conta";
}

/**
 * Todos os lançamentos do período numa listagem para arrumar: busca,
 * filtros, ordem, categoria e fatia trocadas na própria linha, e ações em
 * lote. No computador é uma tabela; no celular, linhas com os dois menus.
 */
export function TransactionsTable({
  items,
  categories,
  cards,
  slicesActive,
  purchases = [],
}: {
  items: HistoryItem[];
  /**
   * As compras no cartão feitas no período, inteiras: com um dia escolhido no
   * calendário, elas substituem as parcelas — o calendário mostra a compra no
   * dia em que foi feita, e a parcela dela pode vencer só no mês que vem.
   */
  purchases?: HistoryItem[];
  categories: Category[];
  cards: { id: string; name: string }[];
  /** Sem fatias configuradas, a coluna de fatia some. */
  slicesActive: boolean;
}) {
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<"all" | "in" | "out" | "jar">("all");
  const [category, setCategory] = useState<string>(ALL);
  const [account, setAccount] = useState<string>(ALL);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "date", desc: true });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  // O dia tocado no calendário de gastos, quando há um.
  const { day, setDay } = useHistoryDay();
  // O dia escolhido no calendário é um filtro como os outros: trocá-lo solta
  // a seleção e volta à primeira página. Ajustado no render, sem efeito.
  const [seenDay, setSeenDay] = useState(day);
  if (seenDay !== day) {
    setSeenDay(day);
    setSelected(new Set());
    setPage(0);
  }

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    const source = day ? [...items.filter((i) => i.kind !== "card"), ...purchases] : items;
    const rows = source.filter((item) => {
      if (day && itemDayKey(item) !== day) return false;
      if (q && !item.description.toLocaleLowerCase("pt-BR").includes(q)) return false;
      if (direction === "in" && (!incoming(item) || transfer(item))) return false;
      if (direction === "out" && (incoming(item) || transfer(item) || billPayment(item)))
        return false;
      if (direction === "jar" && !transfer(item)) return false;
      if (category === NONE && item.categoryId) return false;
      if (category !== ALL && category !== NONE && item.categoryId !== category) return false;
      if (account === ACCOUNT && item.cardId) return false;
      if (account !== ALL && account !== ACCOUNT && item.cardId !== account) return false;
      return true;
    });
    const factor = sort.desc ? -1 : 1;
    return rows.sort((a, b) => {
      if (sort.key === "amount") return (Math.abs(a.amount) - Math.abs(b.amount)) * factor;
      if (sort.key === "description")
        return a.description.localeCompare(b.description, "pt-BR") * factor;
      const byDay = shownDayKey(a).localeCompare(shownDayKey(b));
      if (byDay !== 0) return byDay * factor;
      return ((a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)) * factor;
    });
  }, [items, purchases, query, direction, category, account, sort, day]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE, current * PAGE + PAGE);

  const totals = useMemo(() => {
    const received = filtered.filter(incoming).reduce((sum, i) => sum - i.amount, 0);
    const spent = filtered.filter(countsAsSpending).reduce((sum, i) => sum + i.amount, 0);
    const jars = filtered.filter(transfer);
    const saved = jars.filter((i) => i.amount > 0).reduce((sum, i) => sum + i.amount, 0);
    const withdrawn = jars.filter((i) => i.amount < 0).reduce((sum, i) => sum - i.amount, 0);
    return { received, spent, result: received - spent, saved, withdrawn };
  }, [filtered]);

  // Só o que está na lista filtrada conta como selecionado: uma seleção feita
  // antes de um filtro não pode ser apagada sem estar à vista. E da mesma
  // fonte da lista, senão uma compra marcada no filtro de um dia não aparecia.
  const selectedItems = filtered.filter((i) => selected.has(historyItemKey(i)));
  // Sem fatias, a coluna delas sai da grade em vez de ficar vazia.
  const tableGrid = cn(
    "grid items-center gap-3 border-b border-(--hairline) px-4",
    slicesActive
      ? "grid-cols-[1.5rem_5rem_minmax(0,1fr)_7.5rem_10.5rem_10.5rem_9rem_2.5rem]"
      : "grid-cols-[1.5rem_5rem_minmax(0,1fr)_7.5rem_10.5rem_9rem_2.5rem]",
  );
  const selectable = visible.filter(editable);
  const allVisibleSelected =
    selectable.length > 0 && selectable.every((i) => selected.has(historyItemKey(i)));

  // Trocar de página também solta a seleção: a ação em lote não pode pegar
  // linhas que não estão na tela.
  function turnPage(next: number) {
    setPage(next);
    setSelected(new Set());
  }

  function clearFilters() {
    setQuery("");
    setDirection("all");
    setCategory(ALL);
    setAccount(ALL);
    setDay(null);
    setPage(0);
    setSelected(new Set());
  }

  function resetPage<T>(set: (value: T) => void) {
    return (value: T) => {
      set(value);
      setPage(0);
      // Filtro novo, seleção nova: o que estava marcado pode ter saído da vista.
      setSelected(new Set());
    };
  }

  function toggle(item: HistoryItem) {
    const key = historyItemKey(item);
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((s) => {
      const next = new Set(s);
      for (const item of selectable) {
        if (allVisibleSelected) next.delete(historyItemKey(item));
        else next.add(historyItemKey(item));
      }
      return next;
    });
  }

  function run(task: () => Promise<void>, fallback: string) {
    setError(null);
    startTransition(async () => {
      try {
        await task();
      } catch (e) {
        setError(errorMessage(e, fallback));
      }
    });
  }

  const ref = (item: HistoryItem) => ({ kind: item.kind, id: item.id });
  const changeCategory = (item: HistoryItem, categoryId: string) =>
    run(() => setItemCategory({ ...ref(item), categoryId }), "Não deu para trocar a categoria.");
  const changeSlice = (item: HistoryItem, value: string) =>
    run(
      () => setItemSlice({ ...ref(item), slice: value === AUTO ? null : value }),
      "Não deu para trocar a fatia.",
    );

  function sliceOptions(item: HistoryItem) {
    const fromCategory = item.categoryId ? categoryById.get(item.categoryId)?.slice : undefined;
    return [
      {
        value: AUTO,
        label: fromCategory
          ? `Pela categoria (${sliceInfo(fromCategory)?.name})`
          : "Pela categoria",
      },
      ...spendingSlices.map((s) => ({ value: s.key, label: s.name })),
    ];
  }

  function effectiveSlice(item: HistoryItem) {
    if (isSliceKey(item.slice)) return sliceInfo(item.slice);
    return item.categoryId ? sliceInfo(categoryById.get(item.categoryId)?.slice) : undefined;
  }

  function sortHeader(label: string, sortKey: SortKey, align?: "right") {
    const active = sort.key === sortKey;
    return (
      <button
        type="button"
        onClick={() =>
          setSort({ key: sortKey, desc: active ? !sort.desc : sortKey !== "description" })
        }
        className={cn(
          "inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground",
          align === "right" && "justify-end",
          active && "text-foreground",
        )}
        aria-label={`Ordenar por ${label.toLowerCase()}`}
      >
        {label}
        {active &&
          (sort.desc ? (
            <ArrowDown className="size-3" aria-hidden="true" />
          ) : (
            <ArrowUp className="size-3" aria-hidden="true" />
          ))}
      </button>
    );
  }

  function actions(item: HistoryItem) {
    if (editable(item)) {
      return (
        <MovementFormDialog
          movement={toMovementValues(item)}
          cards={cards}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        >
          <span
            className={iconButton({ tone: "ghost", size: "sm" })}
            aria-label={`Editar ${item.description}`}
            title="Editar"
          >
            <Pencil aria-hidden="true" />
          </span>
        </MovementFormDialog>
      );
    }
    if (item.kind === "incomeReceipt" && item.incomeId) {
      return (
        <DeleteIconButton
          undo
          itemLabel={item.description}
          action={unmarkIncomeReceived.bind(null, item.incomeId, item.date)}
          confirmMessage={`Desfazer o recebimento de "${item.description}"? O lembrete volta a aparecer no início.`}
        />
      );
    }
    if (item.kind === "fixedExpensePayment" || item.kind === "cardBillPayment") {
      return (
        <DeleteIconButton
          undo
          itemLabel={item.description}
          action={unmarkExpensePayment.bind(null, item.id)}
          confirmMessage={`Desfazer o pagamento de "${item.description}"? O lembrete volta a aparecer no início.`}
        />
      );
    }
    return null;
  }

  function amount(item: HistoryItem) {
    if (transfer(item) || billPayment(item))
      return (
        <span className="font-semibold text-muted-foreground tabular-nums">
          {item.amount < 0 ? "+" : billPayment(item) ? "" : "−"}
          {formatCurrency(Math.abs(item.amount))}
        </span>
      );
    const positive = incoming(item);
    return (
      <span className={cn("font-semibold tabular-nums", positive && "text-positive")}>
        {positive ? `+${formatCurrency(-item.amount)}` : formatCurrency(Math.abs(item.amount))}
      </span>
    );
  }

  function categoryCell(item: HistoryItem) {
    if (!editable(item)) {
      const name = item.categoryId ? categoryById.get(item.categoryId)?.name : undefined;
      return <span className="text-[13px] text-muted-foreground">{name ?? "—"}</span>;
    }
    return (
      <ChoiceSelect
        label={`Categoria de ${item.description}`}
        value={item.categoryId}
        placeholder="Sem categoria"
        disabled={busy}
        onChange={(value) => changeCategory(item, value)}
        options={categoryOptions}
        className="w-full min-w-0"
      />
    );
  }

  function sliceCell(item: HistoryItem) {
    const slice = effectiveSlice(item);
    if (!editable(item) || !countsAsSpending(item)) {
      return slice ? (
        <SliceTag slice={slice} />
      ) : (
        <span className="text-[13px] text-muted-foreground">—</span>
      );
    }
    return (
      <ChoiceSelect
        label={`Fatia de ${item.description}`}
        value={isSliceKey(item.slice) ? item.slice : AUTO}
        display={
          isSliceKey(item.slice) ? undefined : (
            <span className="truncate text-muted-foreground">
              {effectiveSlice(item)?.name ?? "Pela categoria"}
            </span>
          )
        }
        disabled={busy}
        onChange={(value) => changeSlice(item, value)}
        options={sliceOptions(item)}
        className="w-full min-w-0"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Busca e filtros. */}
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <label className="relative flex-1 lg:max-w-sm">
          <span className="sr-only">Buscar por descrição</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => resetPage(setQuery)(e.target.value)}
            placeholder="Buscar por descrição"
            className="h-11 w-full rounded-xl bg-(--field) pr-3 pl-10 text-base ring-1 ring-(--hairline) outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        {/* A do meio leva a sobra: com três colunas iguais, "Categoria" cortava. */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2 lg:flex">
          <ChoiceSelect
            label="Entradas ou saídas"
            value={direction}
            onChange={(v) => resetPage(setDirection)(v as typeof direction)}
            options={[
              { value: "all", label: "Tudo" },
              { value: "out", label: "Saídas" },
              { value: "in", label: "Entradas" },
              { value: "jar", label: "Caixinhas" },
            ]}
            className="w-full lg:w-auto"
          />
          <ChoiceSelect
            label="Filtrar por categoria"
            value={category}
            onChange={resetPage(setCategory)}
            options={[
              { value: ALL, label: "Todas as categorias" },
              { value: NONE, label: "Sem categoria" },
              ...categoryOptions,
            ]}
            // Três menus lado a lado no celular: "Todas as categorias" não
            // cabe e virava "Todas as cat".
            display={category === ALL ? "Categoria" : undefined}
            className="w-full lg:w-auto"
          />
          <ChoiceSelect
            label="Filtrar por conta ou cartão"
            value={account}
            onChange={resetPage(setAccount)}
            options={[
              { value: ALL, label: "Conta e cartões" },
              { value: ACCOUNT, label: "Só a conta" },
              ...cards.map((c) => ({ value: c.id, label: c.name })),
            ]}
            display={account === ALL ? "Contas" : undefined}
            className="w-full lg:w-auto"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          {day && (
            <button
              type="button"
              onClick={() => {
                setDay(null);
                setPage(0);
                setSelected(new Set());
              }}
              aria-label="Mostrar todos os dias"
              className="flex h-8 items-center gap-1.5 rounded-full bg-foreground pr-2 pl-3 text-[12.5px] font-semibold text-background"
            >
              Só {dayChipLabel(day)}
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
          <p className="text-[13px] text-muted-foreground">
            {filtered.length === 1 ? "1 lançamento" : `${filtered.length} lançamentos`}
          </p>
        </div>
      </div>

      {/* Ações em lote, quando há seleção. */}
      {selectedItems.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl bg-card px-3 py-2 shadow-(--shadow-card) ring-1 ring-(--hairline)">
          <span className="text-sm font-semibold">
            {selectedItems.length === 1 ? "1 selecionado" : `${selectedItems.length} selecionados`}
          </span>
          <ChoiceSelect
            label="Dar categoria aos selecionados"
            value={null}
            placeholder="Dar categoria"
            disabled={busy}
            onChange={(categoryId) =>
              run(async () => {
                await bulkSetCategory({ items: selectedItems.map(ref), categoryId });
                setSelected(new Set());
              }, "Não deu para trocar as categorias.")
            }
            options={categoryOptions}
          />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => setConfirmBulkDelete(true)}
          >
            <Trash2 aria-hidden="true" />
            Apagar
          </Button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className={cn(iconButton({ tone: "ghost", size: "sm" }), "ml-auto")}
            aria-label="Limpar a seleção"
          >
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/70 px-6 py-10 text-center text-sm text-muted-foreground">
          <p>Nenhum lançamento com esses filtros.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-full px-3 py-2 font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-ring"
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <>
          {/* Computador: a tabela. */}
          <div className={homeCard("hidden overflow-hidden p-0 lg:block lg:p-0")}>
            <div role="table" aria-label="Lançamentos do período" className="min-w-0">
              <div
                role="row"
                className={cn(tableGrid, "py-3")}
              >
                <span role="columnheader">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="Selecionar os desta página"
                    className="size-4 accent-(--primary)"
                  />
                </span>
                <span role="columnheader">{sortHeader("Data", "date")}</span>
                <span role="columnheader">{sortHeader("Descrição", "description")}</span>
                <span role="columnheader" className="text-right">
                  {sortHeader("Valor", "amount", "right")}
                </span>
                {slicesActive && (
                  <span
                    role="columnheader"
                    className="text-[11.5px] font-semibold text-muted-foreground"
                  >
                    Fatia
                  </span>
                )}
                <span
                  role="columnheader"
                  className="text-[11.5px] font-semibold text-muted-foreground"
                >
                  Categoria
                </span>
                <span
                  role="columnheader"
                  className="text-[11.5px] font-semibold text-muted-foreground"
                >
                  Conta
                </span>
                <span role="columnheader" className="sr-only">
                  Ações
                </span>
              </div>
              {visible.map((item) => (
                <div
                  role="row"
                  key={historyItemKey(item)}
                  className={cn(
                    tableGrid,
                    "py-2.5 transition-colors last:border-b-0 hover:bg-card-hover",
                    selected.has(historyItemKey(item)) && "bg-primary/6",
                  )}
                >
                  <span role="cell">
                    {editable(item) && (
                      <input
                        type="checkbox"
                        checked={selected.has(historyItemKey(item))}
                        onChange={() => toggle(item)}
                        aria-label={`Selecionar ${item.description}`}
                        className="size-4 accent-(--primary)"
                      />
                    )}
                  </span>
                  <span role="cell" className="text-[13px] text-muted-foreground tabular-nums">
                    {dayLabel(item)}
                  </span>
                  <span role="cell" className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{item.description}</span>
                    {rowNote(item) && (
                      <span className="block truncate text-xs text-muted-foreground tabular-nums">
                        {rowNote(item)}
                      </span>
                    )}
                  </span>
                  <span role="cell" className="text-right text-sm">
                    {amount(item)}
                  </span>
                  {slicesActive && (
                    <span role="cell" className="min-w-0">
                      {sliceCell(item)}
                    </span>
                  )}
                  <span role="cell" className="min-w-0">
                    {categoryCell(item)}
                  </span>
                  <span role="cell" className="truncate text-[13px] text-muted-foreground">
                    {accountOf(item)}
                  </span>
                  <span role="cell" className="w-10 justify-self-end">
                    {actions(item)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Celular: linhas, com os dois menus embaixo. */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {visible.map((item) => (
              <li
                key={historyItemKey(item)}
                className={homeCard(
                  cn(
                    "flex flex-col gap-2.5 py-3 pr-3 pl-3.5",
                    selected.has(historyItemKey(item)) && "ring-2 ring-primary/40",
                  ),
                )}
              >
                <div className="flex items-start gap-3">
                  {editable(item) ? (
                    // A caixinha tem 16px; o alvo do dedo, 44.
                    <label className="-mx-3.5 -my-2.5 flex size-11 shrink-0 cursor-pointer items-start justify-center pt-3.5">
                      <input
                        type="checkbox"
                        checked={selected.has(historyItemKey(item))}
                        onChange={() => toggle(item)}
                        aria-label={`Selecionar ${item.description}`}
                        className="size-4 accent-(--primary)"
                      />
                    </label>
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{item.description}</p>
                    <p className="text-[12.5px] text-muted-foreground tabular-nums">
                      {dayLabel(item)} · {accountOf(item)}
                      {rowNote(item) ? ` · ${rowNote(item)}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 pt-0.5 text-[15px]">{amount(item)}</span>
                  <div className="-my-1 w-10 shrink-0">{actions(item)}</div>
                </div>
                {editable(item) && (
                  <div
                    className={cn(
                      "grid gap-2 pl-7",
                      slicesActive && countsAsSpending(item) && "grid-cols-2",
                    )}
                  >
                    {categoryCell(item)}
                    {slicesActive && countsAsSpending(item) && sliceCell(item)}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Totais do que está filtrado e páginas. */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Só caixinhas: entrada e saída dariam zero; o que importa é o
                que foi guardado e resgatado, como na nota do Saldo. */}
            {direction === "jar" ? (
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground tabular-nums">
                <span>
                  Guardado <b className="text-foreground">{formatCurrency(totals.saved)}</b>
                </span>
                <span>
                  Resgatado <b className="text-foreground">{formatCurrency(totals.withdrawn)}</b>
                </span>
                <span>
                  Ficou nas caixinhas{" "}
                  <b className="text-foreground">
                    {formatCurrency(totals.saved - totals.withdrawn)}
                  </b>
                </span>
              </p>
            ) : (
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground tabular-nums">
                <span>
                  Entradas <b className="text-positive">{formatCurrency(totals.received)}</b>
                </span>
                <span>
                  Saídas <b className="text-foreground">{formatCurrency(totals.spent)}</b>
                </span>
                <span>
                  Entradas − saídas{" "}
                  <b className={totals.result < 0 ? "text-negative" : "text-foreground"}>
                    {formatCurrency(totals.result)}
                  </b>
                </span>
              </p>
            )}
            {pages > 1 && (
              <div className="flex items-center gap-1 self-end">
                <button
                  type="button"
                  onClick={() => turnPage(current - 1)}
                  disabled={current === 0}
                  className={iconButton({ tone: "ghost", size: "sm" })}
                  aria-label="Página anterior"
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
                <span className="px-2 text-[13px] text-muted-foreground tabular-nums">
                  {current + 1} de {pages}
                </span>
                <button
                  type="button"
                  onClick={() => turnPage(current + 1)}
                  disabled={current >= pages - 1}
                  className={iconButton({ tone: "ghost", size: "sm" })}
                  aria-label="Próxima página"
                >
                  <ChevronRight aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`Apagar ${selectedItems.length === 1 ? "1 lançamento" : `${selectedItems.length} lançamentos`}?`}
        description="Eles saem do Histórico, do orçamento e do saldo. Não dá para desfazer."
        confirmLabel="Apagar"
        onConfirm={() =>
          run(async () => {
            await bulkDelete({ items: selectedItems.map(ref) });
            setSelected(new Set());
            setConfirmBulkDelete(false);
          }, "Não deu para apagar.")
        }
      />
    </div>
  );
}

function SliceTag({ slice }: { slice: { name: string; color: string } }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
      <span
        aria-hidden="true"
        className="size-2 rounded-full"
        style={{ background: slice.color }}
      />
      {slice.name}
    </span>
  );
}
