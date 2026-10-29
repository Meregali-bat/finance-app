import Link from "next/link";
import { CreditCard } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";

/** Um link velho para um cartão excluído: diz o que houve e leva à lista. */
export default function CardNotFound() {
  return (
    <EmptyState
      icon={CreditCard}
      text="Este cartão foi excluído ou não existe."
      hint="As compras de um cartão excluído continuam no Histórico."
      action={
        <Link href="/cartoes" className={buttonVariants({ variant: "outline" })}>
          Voltar para cartões
        </Link>
      }
    />
  );
}
