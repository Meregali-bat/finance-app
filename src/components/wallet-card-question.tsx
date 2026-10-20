"use client";

import { useState, useTransition } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { homeCard } from "@/components/home-card";
import { linkWalletCard } from "@/lib/actions/shortcut";
import { errorMessage } from "@/lib/error-message";
import { formatCurrency } from "@/lib/format";

export interface PendingWalletCard {
  id: string;
  walletName: string;
  /** As compras que já entraram como gasto da conta por causa deste nome. */
  count: number;
  total: number;
}

/**
 * "De qual cartão é?" para um nome que a Carteira mandou e o app não
 * reconheceu. Responde-se uma vez por nome: depois, as compras vão direto.
 */
export function WalletCardQuestion({
  pending,
  cards,
}: {
  pending: PendingWalletCard;
  cards: { id: string; name: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function answer(target: string) {
    setError(null);
    setChoice(target);
    startTransition(async () => {
      try {
        await linkWalletCard(pending.id, target);
      } catch (e) {
        setError(errorMessage(e, "Não deu para salvar. Tente de novo."));
        setChoice(null);
      }
    });
  }

  return (
    <div className={homeCard("flex flex-col gap-3")}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary"
        >
          <CircleHelp className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[15px] font-semibold">
            A Carteira mandou “{pending.walletName}”: de qual cartão é?
          </p>
          <p className="text-[13px] text-muted-foreground">
            {pending.count > 0
              ? `${pending.count === 1 ? "1 compra" : `${pending.count} compras`} de ${formatCurrency(pending.total)} ${pending.count === 1 ? "entrou" : "entraram"} como gasto da conta e ${pending.count === 1 ? "vai" : "vão"} para o cartão escolhido. `
              : ""}
            Você só responde uma vez; as próximas compras vão direto.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {cards.map((card) => (
          <Button
            key={card.id}
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => answer(card.id)}
          >
            {busy && choice === card.id ? "Salvando..." : card.name}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => answer("account")}
          className="text-muted-foreground"
        >
          {busy && choice === "account" ? "Salvando..." : "É débito (fica na conta)"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
