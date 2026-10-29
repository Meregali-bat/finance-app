"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CircleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { homeCard } from "@/components/home-card";

/**
 * Quando uma tela falha ao montar: a voz do app em vez da página crua do
 * Next, com o caminho de volta. "Tentar de novo" refaz só o segmento.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={homeCard("flex flex-col items-start gap-3 lg:max-w-lg")} role="alert">
      <CircleAlert aria-hidden="true" className="size-6 text-muted-foreground" strokeWidth={1.5} />
      <h1 className="font-heading text-xl font-bold tracking-[-0.02em]">
        Não deu para abrir esta tela
      </h1>
      <p className="text-sm text-muted-foreground">
        Nada do que você lançou foi perdido. Pode ter sido a conexão: tente de novo em instantes.
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        <Button onClick={() => retry()}>Tentar de novo</Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Ir para o início
        </Link>
      </div>
    </div>
  );
}
