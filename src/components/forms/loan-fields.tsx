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

const NEW_PERSON = "__new__";

/**
 * "Emprestado para alguém", dentro do formulário de uma despesa. Desligado,
 * não manda nada e a despesa é só sua. Ligado, diz quem deve, quanto (vazio =
 * a despesa toda) e, se combinaram, em quantas vezes e a partir de quando.
 *
 * As pessoas e o empréstimo atual vêm do servidor quando o formulário abre.
 */
export function LoanFields({ link }: { link?: { kind: "transaction" | "card"; id: string } }) {
  const [loaded, setLoaded] = useState(false);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [lent, setLent] = useState(false);
  const [personId, setPersonId] = useState(NEW_PERSON);
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
            <Label htmlFor="lent-amount">Quanto te deve</Label>
            <CurrencyInput id="lent-amount" name="lentAmount" defaultValue={defaults.amount} />
            <p className="text-xs text-muted-foreground">Em branco, o valor todo da despesa.</p>
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
