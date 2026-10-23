"use client";

import { useEffect, useState } from "react";
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

/**
 * Quanto da despesa a pessoa deve, em atalhos: o caso comum é dividir a conta
 * com alguém, e digitar a metade de R$ 87,30 de cabeça não é coisa de celular.
 */
const SHARES = [
  { key: "half", label: "Metade", value: 1 / 2 },
  { key: "third", label: "Um terço", value: 1 / 3 },
  { key: "all", label: "Tudo", value: 1 },
  { key: "custom", label: "Outro valor", value: null },
] as const;
type ShareKey = (typeof SHARES)[number]["key"];

/**
 * "Emprestado para alguém", dentro do formulário de uma despesa. Desligado,
 * não manda nada e a despesa é só sua. Ligado, diz quem deve, quanto (vazio =
 * a despesa toda) e, se combinaram, em quantas vezes e a partir de quando.
 *
 * As pessoas e o empréstimo atual vêm do servidor quando o formulário abre.
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
  const [personId, setPersonId] = useState(NEW_PERSON);
  // Dividir com alguém é o caso comum: um empréstimo novo começa na metade.
  const [share, setShare] = useState<ShareKey>("half");
  const [defaults, setDefaults] = useState<{
    amount?: number;
    installments: number;
    firstDueDate: string;
  }>({ installments: 1, firstDueDate: "" });
  const linkKind = link?.kind;
  const linkId = link?.id;

  useEffect(() => {
    let alive = true;
    getLoanFormData(linkKind && linkId ? { kind: linkKind, id: linkId } : undefined)
      .then((data) => {
        if (!alive) return;
        setPeople(data.people);
        if (data.loan) {
          setLent(true);
          // Um empréstimo que já existe mostra o valor gravado, como está.
          setShare("custom");
          setPersonId(data.loan.personId);
          setDefaults({
            amount: data.loan.amount,
            installments: data.loan.installments,
            firstDueDate: data.loan.firstDueDate,
          });
        } else if (data.people.length > 0) {
          setPersonId(data.people[0].id);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      alive = false;
    };
  }, [linkKind, linkId]);

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-3">
      <input type="hidden" name="lent" value={lent ? "1" : ""} />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor="lent-switch">Emprestado para alguém</Label>
          <p className="text-xs text-muted-foreground">
            Conta como gasto agora; o que a pessoa devolver entra como receita.
          </p>
        </div>
        <Switch id="lent-switch" checked={lent} onCheckedChange={setLent} disabled={!loaded} />
      </div>

      {lent && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lent-person">Para quem</Label>
            {people.length > 0 && (
              <Select value={personId} onValueChange={(v) => setPersonId(v as string)}>
                <SelectTrigger id="lent-person" className="w-full">
                  <SelectValue>
                    {(value: string) =>
                      value === NEW_PERSON
                        ? "Outra pessoa…"
                        : people.find((p) => p.id === value)?.name
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_PERSON}>Outra pessoa…</SelectItem>
                </SelectContent>
              </Select>
            )}
            {personId === NEW_PERSON ? (
              <Input
                id={people.length > 0 ? undefined : "lent-person"}
                name="lentPersonName"
                placeholder="Nome"
                maxLength={60}
                required
              />
            ) : (
              <input type="hidden" name="lentPersonId" value={personId} />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={share === "custom" ? "lent-amount" : undefined}>Quanto te deve</Label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Quanto te deve">
              {SHARES.map((option) => {
                const active = option.key === share;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setShare(option.key)}
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
            {share === "custom" ? (
              <>
                <CurrencyInput id="lent-amount" name="lentAmount" defaultValue={defaults.amount} />
                <p className="text-xs text-muted-foreground">Em branco, o valor todo da despesa.</p>
              </>
            ) : (
              <>
                <input
                  type="hidden"
                  name="lentShare"
                  value={SHARES.find((s) => s.key === share)!.value!}
                />
                <p className="text-[13px] text-muted-foreground tabular-nums">
                  {total && total > 0 ? (
                    <>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(
                          Math.round(total * SHARES.find((s) => s.key === share)!.value! * 100) /
                            100,
                        )}
                      </span>{" "}
                      de {formatCurrency(total)}
                    </>
                  ) : share === "all" ? (
                    "O valor todo da despesa."
                  ) : (
                    `${SHARES.find((s) => s.key === share)!.label} do valor da despesa.`
                  )}
                </p>
              </>
            )}
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
            Parcelas mensais a partir da data combinada. Sem data, fica só como lembrete do total.
          </p>
        </>
      )}
    </div>
  );
}
