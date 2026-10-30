"use client";

import { unwrap } from "@/lib/action-result";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/currency-input";
import { listRowSurface } from "@/components/list-row";
import { createIncome, deleteIncome } from "@/lib/actions/income";
import { setAccountBalance } from "@/lib/actions/account-balance";
import { createFixedExpense, deleteFixedExpense } from "@/lib/actions/expense";
import { createCreditCard, deleteCreditCard } from "@/lib/actions/card";
import { finishOnboarding } from "@/lib/actions/onboarding";
import { errorMessage } from "@/lib/error-message";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const stepHref = (step: number) => `/comecar?passo=${step}`;

/** "Passo 2 de 4" e a barra em segmentos: onde se está e quanto falta. */
export function StepHeader({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[13px] font-medium text-muted-foreground tabular-nums">
        Passo {step} de {total}
      </p>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-label="Progresso do primeiro uso"
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }}
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-colors duration-500",
              i < step ? "bg-primary" : "bg-(--track)",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function StepTitle({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rise-in flex flex-col gap-2">
      <h1 className="font-heading text-[28px] leading-[1.1] font-bold tracking-[-0.035em] text-balance lg:text-[32px]">
        {title}
      </h1>
      <p className="text-[15px] leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

/** O rodapé de cada passo: voltar à esquerda, a ação principal à direita. */
function StepActions({ back, children }: { back?: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      {back ? (
        <Link
          href={stepHref(back)}
          className="flex h-11 items-center gap-1.5 rounded-[14px] px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar
        </Link>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

const PRIMARY =
  "cta-surface flex h-12 items-center justify-center rounded-[14px] px-6 text-[15px] font-semibold text-white transition-[transform,box-shadow] duration-150 ease-out-quint active:scale-[0.98] disabled:opacity-70";
const SECONDARY =
  "flex h-12 items-center justify-center rounded-[14px] px-4 text-[15px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
const CARD =
  "rise-in flex flex-col gap-4 rounded-[20px] bg-card p-[18px] shadow-(--shadow-card) lg:p-6";

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-negative">
      {error}
    </p>
  );
}

/** Uma linha do que já foi adicionado no passo, com o "tirar". */
function AddedRow({
  title,
  detail,
  onRemove,
  removing,
}: {
  title: string;
  detail: string;
  onRemove: () => void;
  removing: boolean;
}) {
  return (
    <li className={listRowSurface("flex items-center gap-3 py-2.5 pr-1.5 pl-4")}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold">{title}</p>
        <p className="text-[12.5px] text-muted-foreground tabular-nums">{detail}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        aria-label={`Tirar ${title}`}
        title="Tirar"
        className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

/** O dia do mês, com o teclado numérico no celular. */
function DayInput({ id, name, defaultValue }: { id: string; name: string; defaultValue?: number }) {
  return (
    <Input
      id={id}
      name={name}
      type="number"
      inputMode="numeric"
      min={1}
      max={31}
      placeholder="1 a 31"
      defaultValue={defaultValue}
      required
    />
  );
}

// ── Passo 1: renda ────────────────────────────────────────────────────────

type IncomeView = { id: string; label: string; amount: number; dayOfMonth: number };

export function IncomeStep({ incomes }: { incomes: IncomeView[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(incomes.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);

  function save(formData: FormData) {
    setError(null);
    const first = incomes.length === 0;
    startTransition(async () => {
      try {
        unwrap(await createIncome(formData));
        if (first) {
          router.push(stepHref(2));
        } else {
          setAdding(false);
          router.refresh();
        }
      } catch (e) {
        setError(errorMessage(e, "Não deu para salvar a renda. Confira o valor e o dia."));
      }
    });
  }

  return (
    <>
      <StepTitle title="Quanto você recebe, e quando?">
        O período do app vai de um pagamento ao próximo. Recebe em mais de um dia — dia 5 e dia 20,
        por exemplo? Adicione cada um.
      </StepTitle>

      {incomes.length > 0 && (
        <ul className="rise-in flex flex-col gap-2">
          {incomes.map((income) => (
            <AddedRow
              key={income.id}
              title={income.label}
              detail={`${formatCurrency(income.amount)} · todo dia ${income.dayOfMonth}`}
              removing={removingId === income.id}
              onRemove={() => {
                setRemovingId(income.id);
                startTransition(async () => {
                  await deleteIncome(income.id);
                  router.refresh();
                  setRemovingId(null);
                });
              }}
            />
          ))}
        </ul>
      )}

      {adding ? (
        <form action={save} className={CARD}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="income-label">Nome</Label>
            <Input
              id="income-label"
              name="label"
              defaultValue={incomes.length === 0 ? "Salário" : ""}
              placeholder="Salário"
              maxLength={80}
              required
            />
          </div>
          <div className="grid grid-cols-[1fr_7.5rem] gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="income-amount">Valor</Label>
              <CurrencyInput id="income-amount" name="amount" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="income-day">Dia</Label>
              <DayInput id="income-day" name="dayOfMonth" />
            </div>
          </div>
          <ErrorText error={error} />
          <div className="flex justify-end gap-2">
            {incomes.length > 0 && (
              <button type="button" className={SECONDARY} onClick={() => setAdding(false)}>
                Cancelar
              </button>
            )}
            <button type="submit" disabled={pending} className={PRIMARY}>
              {pending ? "Salvando…" : incomes.length === 0 ? "Continuar" : "Adicionar"}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-12 items-center justify-center gap-2 rounded-[14px] border border-dashed border-(--hairline-strong) text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="size-4" aria-hidden="true" />
          Outra renda
        </button>
      )}

      {incomes.length > 0 && !adding && (
        <StepActions>
          <Link href={stepHref(2)} className={PRIMARY}>
            Continuar
          </Link>
        </StepActions>
      )}
    </>
  );
}

// ── Passo 2: saldo em conta ───────────────────────────────────────────────

export function BalanceStep({ current }: { current: number | null }) {
  const router = useRouter();
  const [negative, setNegative] = useState(current != null && current < 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(formData: FormData) {
    setError(null);
    formData.set("sign", negative ? "negativo" : "positivo");
    startTransition(async () => {
      try {
        await setAccountBalance(formData);
        router.push(stepHref(3));
      } catch (e) {
        setError(errorMessage(e, "Não deu para salvar o saldo."));
      }
    });
  }

  return (
    <>
      <StepTitle title="Quanto tem na conta agora?">
        É o ponto de partida: o app desconta daqui as contas que ainda vencem até o próximo
        pagamento. Olhe o saldo no app do banco. Se pular, o primeiro período começa do zero — dá
        para informar depois, na Início.
      </StepTitle>

      <form action={save} className={CARD}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="balance">Saldo em conta</Label>
          <CurrencyInput
            id="balance"
            name="balance"
            defaultValue={current != null ? Math.abs(current) : undefined}
            required
          />
        </div>
        <label className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={negative}
            onChange={(e) => setNegative(e.target.checked)}
            className="size-4 accent-(--primary)"
          />
          Está negativo (no cheque especial)
        </label>
        <ErrorText error={error} />
        <StepActions back={1}>
          <Link href={stepHref(3)} className={SECONDARY}>
            Pular
          </Link>
          <button type="submit" disabled={pending} className={PRIMARY}>
            {pending ? "Salvando…" : "Continuar"}
          </button>
        </StepActions>
      </form>
    </>
  );
}

// ── Passo 3: contas fixas ─────────────────────────────────────────────────

const SUGGESTIONS = ["Aluguel", "Condomínio", "Internet", "Luz", "Água", "Celular", "Academia"];

type ExpenseView = { id: string; label: string; amount: number; dueDay: number | null };

export function ExpensesStep({ expenses }: { expenses: ExpenseView[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  // Muda a cada conta salva, para o formulário voltar vazio.
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const added = new Set(expenses.map((e) => e.label.toLowerCase()));

  function save(formData: FormData) {
    setError(null);
    formData.set("label", label);
    startTransition(async () => {
      try {
        unwrap(await createFixedExpense(formData));
        setLabel("");
        setFormKey((k) => k + 1);
        router.refresh();
      } catch (e) {
        setError(errorMessage(e, "Não deu para salvar a conta. Confira o valor e o dia."));
      }
    });
  }

  return (
    <>
      <StepTitle title="Quais contas chegam todo mês?">
        Aluguel, internet, luz — o que vence sempre no mesmo dia. Elas saem do período em que
        vencem. Não precisa lembrar de tudo agora: o resto entra em Fixos, quando quiser.
      </StepTitle>

      {expenses.length > 0 && (
        <ul className="rise-in flex flex-col gap-2">
          {expenses.map((expense) => (
            <AddedRow
              key={expense.id}
              title={expense.label}
              detail={`${formatCurrency(expense.amount)}${
                expense.dueDay ? ` · vence dia ${expense.dueDay}` : ""
              }`}
              removing={removingId === expense.id}
              onRemove={() => {
                setRemovingId(expense.id);
                startTransition(async () => {
                  await deleteFixedExpense(expense.id);
                  router.refresh();
                  setRemovingId(null);
                });
              }}
            />
          ))}
        </ul>
      )}

      <form key={formKey} action={save} className={CARD}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="expense-label">Conta</Label>
          <div className="flex flex-wrap gap-1.5" aria-label="Sugestões">
            {SUGGESTIONS.filter((s) => !added.has(s.toLowerCase())).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setLabel(suggestion)}
                aria-pressed={label === suggestion}
                className={cn(
                  "h-9 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
                  label === suggestion
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-foreground hover:bg-(--secondary-hover)",
                )}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <Input
            id="expense-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ou escreva: Escola, Plano de saúde…"
            maxLength={80}
            required
          />
        </div>
        <div className="grid grid-cols-[1fr_7.5rem] gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="expense-amount">Valor</Label>
            <CurrencyInput id="expense-amount" name="amount" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="expense-day">Vence dia</Label>
            <DayInput id="expense-day" name="dueDay" />
          </div>
        </div>
        <ErrorText error={error} />
        <button
          type="submit"
          disabled={pending || !label.trim()}
          className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-secondary text-sm font-semibold transition-colors hover:bg-(--secondary-hover) disabled:opacity-50"
        >
          <Plus className="size-4" aria-hidden="true" />
          {pending ? "Adicionando…" : "Adicionar conta"}
        </button>
      </form>

      <StepActions back={2}>
        <Link href={stepHref(4)} className={expenses.length > 0 ? PRIMARY : SECONDARY}>
          {expenses.length > 0 ? "Continuar" : "Pular"}
        </Link>
      </StepActions>
    </>
  );
}

// ── Passo 4: cartão ───────────────────────────────────────────────────────

type CardView = { id: string; name: string; closingDay: number; dueDay: number };

export function CardStep({ cards }: { cards: CardView[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(cards.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [finishing, startFinish] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);

  function save(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createCreditCard(formData);
        setAdding(false);
        router.refresh();
      } catch (e) {
        setError(errorMessage(e, "Não deu para salvar o cartão. Confira os dias."));
      }
    });
  }

  return (
    <>
      <StepTitle title="Usa cartão de crédito?">
        Com o dia do fechamento e do vencimento, cada compra cai na fatura certa, e a fatura sai do
        período em que vence. As compras você lança no dia a dia.
      </StepTitle>

      {cards.length > 0 && (
        <ul className="rise-in flex flex-col gap-2">
          {cards.map((card) => (
            <AddedRow
              key={card.id}
              title={card.name}
              detail={`Fecha dia ${card.closingDay} · vence dia ${card.dueDay}`}
              removing={removingId === card.id}
              onRemove={() => {
                setRemovingId(card.id);
                startTransition(async () => {
                  await deleteCreditCard(card.id);
                  router.refresh();
                  setRemovingId(null);
                });
              }}
            />
          ))}
        </ul>
      )}

      {adding ? (
        <form action={save} className={CARD}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="card-name">Nome do cartão</Label>
            <Input id="card-name" name="name" placeholder="Nubank" maxLength={80} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="card-closing">Fecha dia</Label>
              <DayInput id="card-closing" name="closingDay" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="card-due">Vence dia</Label>
              <DayInput id="card-due" name="dueDay" />
            </div>
          </div>
          <ErrorText error={error} />
          <div className="flex justify-end gap-2">
            {cards.length > 0 && (
              <button type="button" className={SECONDARY} onClick={() => setAdding(false)}>
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={pending}
              className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-secondary px-5 text-sm font-semibold transition-colors hover:bg-(--secondary-hover) disabled:opacity-50"
            >
              {pending ? "Salvando…" : "Adicionar cartão"}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-12 items-center justify-center gap-2 rounded-[14px] border border-dashed border-(--hairline-strong) text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="size-4" aria-hidden="true" />
          Outro cartão
        </button>
      )}

      <StepActions back={3}>
        <button
          type="button"
          disabled={finishing}
          onClick={() => startFinish(() => finishOnboarding())}
          className={PRIMARY}
        >
          {finishing
            ? "Calculando…"
            : cards.length > 0
              ? "Ver meu número"
              : "Pular e ver meu número"}
        </button>
      </StepActions>
    </>
  );
}
