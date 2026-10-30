"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencyInput } from "@/components/currency-input";
import { getLoanFormData } from "@/lib/actions/loan";
import { formatCurrency } from "@/lib/format";

const NEW_PERSON = "__new__";

type Row = { key: number; personId: string; amount?: number };

/**
 * Como a conta se divide, em atalhos: o caso comum é dividir com quem comeu
 * junto, e fazer a conta de R$ 87,30 em três de cabeça não é coisa de celular.
 * - "Igual": você entra na divisão (com uma pessoa, metade).
 * - "Só eles": você pagou e não consumiu (com uma pessoa, tudo).
 * - "Outro valor": cada um com o seu.
 */
type Split = "equal" | "others" | "custom";

const PARTS = ["Metade", "Em três", "Em quatro", "Em cinco", "Em seis"];

function splitOptions(n: number): { key: Split; label: string }[] {
  return [
    { key: "equal", label: PARTS[n - 1] ?? `Em ${n + 1}` },
    { key: "others", label: n === 1 ? "Tudo" : "Só eles" },
    { key: "custom", label: "Outro valor" },
  ];
}

function shareOf(split: Split, n: number) {
  return split === "equal" ? 1 / (n + 1) : 1 / n;
}

/**
 * "Emprestado para alguém", dentro do formulário de uma despesa. Desligado,
 * não manda nada e a despesa é só sua. Ligado, diz quem deve — uma pessoa ou
 * várias, numa conta dividida —, quanto cada uma e, se combinaram, em
 * quantas vezes e a partir de quando.
 *
 * As pessoas e os empréstimos atuais vêm do servidor quando o formulário abre.
 */
export function LoanFields({
  link,
  total,
}: {
  link?: { kind: "transaction" | "card"; id: string };
  /** O valor da despesa como está no formulário, para mostrar a parte calculada. */
  total?: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [lent, setLent] = useState(false);
  const [rows, setRows] = useState<Row[]>([{ key: 0, personId: NEW_PERSON }]);
  const nextKey = useRef(1);
  // Dividir com alguém é o caso comum: um empréstimo novo começa dividido igual.
  const [split, setSplit] = useState<Split>("equal");
  const [defaults, setDefaults] = useState({ installments: 1, firstDueDate: "" });
  const linkKind = link?.kind;
  const linkId = link?.id;

  useEffect(() => {
    let alive = true;
    getLoanFormData(linkKind && linkId ? { kind: linkKind, id: linkId } : undefined)
      .then((data) => {
        if (!alive) return;
        setPeople(data.people);
        if (data.loans.length > 0) {
          setLent(true);
          // Um empréstimo que já existe mostra os valores gravados, como estão.
          setSplit("custom");
          setRows(data.loans.map((l, i) => ({ key: i, personId: l.personId, amount: l.amount })));
          nextKey.current = data.loans.length;
          setDefaults({ installments: data.installments, firstDueDate: data.firstDueDate });
        } else if (data.people.length > 0) {
          setRows([{ key: 0, personId: data.people[0].id }]);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      alive = false;
    };
  }, [linkKind, linkId]);

  const n = rows.length;
  const share = split === "custom" ? null : shareOf(split, n);
  const each = share != null && total && total > 0 ? Math.round(total * share * 100) / 100 : null;

  function addRow() {
    const taken = new Set(rows.map((r) => r.personId));
    const free = people.find((p) => !taken.has(p.id));
    setRows([...rows, { key: nextKey.current++, personId: free?.id ?? NEW_PERSON }]);
  }

  function updateRow(key: number, personId: string) {
    setRows(rows.map((r) => (r.key === key ? { ...r, personId } : r)));
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-3">
      <input type="hidden" name="lent" value={lent ? "1" : ""} />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor="lent-switch">Emprestado para alguém</Label>
          <p className="text-xs text-muted-foreground">
            Sai do saldo, mas não conta no seu gasto. A devolução volta ao saldo sem virar renda.
          </p>
        </div>
        <Switch id="lent-switch" checked={lent} onCheckedChange={setLent} disabled={!loaded} />
      </div>

      {lent && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lent-person-0">Para quem</Label>
            {rows.map((row, i) => {
              // Cada pessoa aparece numa linha só: as outras linhas a tiram da lista.
              const others = new Set(rows.filter((r) => r.key !== row.key).map((r) => r.personId));
              const options = people.filter((p) => !others.has(p.id));
              return (
                <div key={row.key} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      {people.length > 0 && (
                        <Select
                          value={row.personId}
                          onValueChange={(v) => updateRow(row.key, v as string)}
                        >
                          <SelectTrigger id={`lent-person-${i}`} className="w-full">
                            <SelectValue>
                              {(value: string) =>
                                value === NEW_PERSON
                                  ? "Outra pessoa…"
                                  : people.find((p) => p.id === value)?.name
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {options.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                            <SelectItem value={NEW_PERSON}>Outra pessoa…</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      {row.personId === NEW_PERSON ? (
                        <Input
                          id={people.length > 0 ? undefined : `lent-person-${i}`}
                          name={`lent.${i}.personName`}
                          placeholder="Nome"
                          aria-label={people.length > 0 ? "Nome da pessoa" : undefined}
                          maxLength={60}
                          required
                        />
                      ) : (
                        <input type="hidden" name={`lent.${i}.personId`} value={row.personId} />
                      )}
                    </div>
                    {n > 1 && (
                      <button
                        type="button"
                        onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                        aria-label="Tirar esta pessoa"
                        className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {split === "custom" ? (
                    <CurrencyInput
                      name={`lent.${i}.amount`}
                      defaultValue={row.amount}
                      required={n > 1}
                    />
                  ) : (
                    <input type="hidden" name={`lent.${i}.share`} value={share!} />
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={addRow}
              disabled={n >= 20}
              className="flex h-10 items-center gap-1.5 self-start rounded-full px-1 text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              <Plus className="size-4" aria-hidden="true" />
              Adicionar pessoa
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{n > 1 ? "Quanto cada um te deve" : "Quanto te deve"}</Label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Quanto te deve">
              {splitOptions(n).map((option) => {
                const active = option.key === split;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSplit(option.key)}
                    className={
                      active
                        ? "h-9 rounded-full bg-foreground px-3.5 text-[13px] font-semibold text-background"
                        : "h-9 rounded-full px-3.5 text-[13px] font-medium text-muted-foreground ring-1 ring-(--hairline) transition-colors duration-150 hover:text-foreground"
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[13px] text-muted-foreground tabular-nums">
              {split === "custom" ? (
                n > 1 ? (
                  "O valor de cada um, no campo embaixo do nome."
                ) : (
                  "Em branco, o valor todo da despesa."
                )
              ) : each != null ? (
                <>
                  <span className="font-semibold text-foreground">{formatCurrency(each)}</span>
                  {n > 1 ? " cada" : ""} de {formatCurrency(total!)}
                  {split === "equal" && n > 1 ? ", você incluído" : ""}
                </>
              ) : split === "equal" ? (
                n > 1 ? (
                  `A despesa em ${n + 1}, você incluído.`
                ) : (
                  "Metade do valor da despesa."
                )
              ) : n > 1 ? (
                `A despesa em ${n}, sem você.`
              ) : (
                "O valor todo da despesa."
              )}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="lent-installments">Devolve em</Label>
              <Input
                id="lent-installments"
                name="lentInstallments"
                type="number"
                inputMode="numeric"
                min="1"
                max="48"
                defaultValue={defaults.installments}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lent-due">Combinado para</Label>
              <Input
                id="lent-due"
                name="lentDueDate"
                type="date"
                defaultValue={defaults.firstDueDate}
              />
            </div>
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">
            {n > 1
              ? "Vale para todos: parcelas mensais a partir da data combinada. Sem data, fica só como lembrete do total."
              : "Parcelas mensais a partir da data combinada. Sem data, fica só como lembrete do total."}
          </p>
        </>
      )}
    </div>
  );
}
