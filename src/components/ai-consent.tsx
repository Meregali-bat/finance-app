"use client";

import { createContext, useCallback, useContext, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { grantAiConsent } from "@/lib/actions/consent";
import { errorMessage } from "@/lib/error-message";

type Ensure = () => Promise<boolean>;

const AiConsentContext = createContext<Ensure | null>(null);

/**
 * Antes de qualquer análise com IA: se a pessoa ainda não autorizou mandar os
 * dados à Anthropic, abre o pedido e espera a resposta. A action confere de
 * novo no servidor; isto é só para a pergunta vir na hora certa, e não como
 * um erro depois do toque.
 */
export function useAiConsent(): Ensure {
  const ensure = useContext(AiConsentContext);
  // Fora do provedor (não deveria acontecer): segue, e o servidor recusa se faltar.
  return ensure ?? (async () => true);
}

export function AiConsentProvider({ initial, children }: { initial: boolean; children: React.ReactNode }) {
  const [granted, setGranted] = useState(initial);
  // Revogar no Perfil revalida o layout e muda `initial`: acompanha.
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setGranted(initial);
  }
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const pending = useRef<((ok: boolean) => void) | null>(null);

  const ensure = useCallback<Ensure>(() => {
    if (granted) return Promise.resolve(true);
    setError(null);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      pending.current?.(false);
      pending.current = resolve;
    });
  }, [granted]);

  function answer(ok: boolean) {
    pending.current?.(ok);
    pending.current = null;
    setOpen(false);
  }

  function authorize() {
    setError(null);
    startSaving(async () => {
      try {
        await grantAiConsent();
        setGranted(true);
        answer(true);
      } catch (e) {
        setError(errorMessage(e, "Não deu para salvar a autorização. Tente de novo."));
      }
    });
  }

  return (
    <AiConsentContext.Provider value={ensure}>
      {children}
      <Dialog open={open} onOpenChange={(next) => !next && answer(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Autorizar o envio para a IA?</DialogTitle>
            <DialogDescription>
              As análises com IA são feitas pela Anthropic, uma empresa nos Estados Unidos. Para
              funcionar, o Leeway manda para ela os dados da análise que você pediu:
            </DialogDescription>
          </DialogHeader>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13.5px] text-muted-foreground">
            <li>Metas: descrições e valores dos gastos dos últimos 3 períodos (cerca de 90 dias), sua renda e suas categorias.</li>
            <li>Extrato: o PDF inteiro que você enviar, com os lançamentos do app no mesmo período.</li>
            <li>Fatura e prints: as compras do cartão e as imagens que você enviar.</li>
          </ul>
          <p className="text-[13.5px] text-muted-foreground">
            A Anthropic apaga esses dados em até 30 dias e não os usa para treinar modelos, salvo
            exceções descritas na{" "}
            <Link href="/privacidade#ia" target="_blank" className="font-semibold text-foreground underline underline-offset-2">
              política de privacidade
            </Link>
            . Você pode revogar quando quiser, no Perfil. Sem autorizar, o resto do app funciona
            normalmente.
          </p>
          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => answer(false)}>
              Agora não
            </Button>
            <Button type="button" disabled={saving} onClick={authorize}>
              {saving ? "Salvando…" : "Autorizar e continuar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AiConsentContext.Provider>
  );
}
