"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { homeCard } from "@/components/home-card";
import { generateShortcutToken, revokeShortcutToken } from "@/lib/actions/shortcut";
import { errorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";

/**
 * O bloco "Lançar automático pelo iPhone" da tela Cartões: liga o atalho que
 * lança cada pagamento por aproximação (src/app/api/atalho). A chave só existe
 * em texto no momento em que é gerada; depois, o banco guarda só o hash.
 */
export function ShortcutSetup({ active, endpoint }: { active: boolean; endpoint: string }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      try {
        setToken(await generateShortcutToken());
      } catch (e) {
        setError(errorMessage(e, "Não deu para gerar a chave."));
      }
    });
  }

  function revoke() {
    setError(null);
    startTransition(async () => {
      try {
        await revokeShortcutToken();
        setToken(null);
        setOpen(false);
      } catch (e) {
        setError(errorMessage(e, "Não deu para desligar."));
      }
    });
  }

  return (
    <div className={homeCard("flex flex-wrap items-center gap-x-4 gap-y-3")}>
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary"
      >
        <Smartphone className="size-5" />
      </span>
      <div className="min-w-[12rem] flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-heading text-[15px] font-semibold">
          Lançar automático pelo iPhone
          {active && (
            <span className="rounded-full bg-positive/12 px-2 py-0.5 font-sans text-[11px] font-semibold text-positive">
              Ligado
            </span>
          )}
        </p>
        <p className="text-[13px] text-muted-foreground">
          Pagou encostando o iPhone, a compra entra sozinha no cartão certo.
        </p>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // A chave aparece uma vez: fechou, some da tela.
          if (!next) {
            setToken(null);
            setError(null);
          }
        }}
      >
        <DialogTrigger
          render={<Button variant={active ? "outline" : "default"} className="w-full sm:w-auto" />}
        >
          {active ? "Ver passos" : "Configurar"}
        </DialogTrigger>
        <DialogContent className="max-h-[90dvh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Lançar automático pelo iPhone</DialogTitle>
            <DialogDescription>
              Uma automação do app Atalhos manda cada pagamento por aproximação para cá. Só vale
              para o que passa pela Carteira: cartão físico e Pix continuam à mão, e compra
              parcelada entra à vista (dá para editar depois).
            </DialogDescription>
          </DialogHeader>

          <ol className="flex min-w-0 flex-col gap-4 text-sm">
            <Step n={1} title="Gere a sua chave">
              {token ? (
                <>
                  <CopyField label="Chave" value={token} />
                  <p className="text-[13px] text-muted-foreground">
                    Ela só aparece agora. Copie para o atalho antes de fechar; se perder, é só gerar
                    outra.
                  </p>
                </>
              ) : (
                <>
                  {active && (
                    <p className="text-[13px] text-muted-foreground">
                      Já existe uma chave ligada. Gerar outra faz o atalho com a antiga parar de
                      lançar.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant={active ? "outline" : "default"}
                    onClick={generate}
                    disabled={pending}
                    className="self-start"
                  >
                    {pending ? "Gerando..." : active ? "Gerar nova chave" : "Gerar chave"}
                  </Button>
                </>
              )}
            </Step>

            <Step n={2} title="Crie a automação">
              <p>
                No app <b>Atalhos</b>, abra <b>Automação</b>, toque em <b>+</b> e escolha{" "}
                <b>Transação</b>. Marque os seus cartões, escolha <b>Executar Imediatamente</b> e
                siga para criar um atalho novo.
              </p>
            </Step>

            <Step n={3} title="Mande a compra para o app">
              <p>
                Adicione a ação <b>Obter Conteúdo do URL</b> e preencha:
              </p>
              <CopyField label="URL" value={endpoint} />
              <ul className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
                <li>
                  <b className="text-foreground">Método:</b> POST
                </li>
                <li>
                  <b className="text-foreground">Cabeçalho:</b> chave <code>Authorization</code>,
                  valor: a sua chave, colada como está
                </li>
                <li>
                  <b className="text-foreground">Corpo da solicitação:</b> JSON, com três campos de
                  texto vindos da Entrada do Atalho: <code>valor</code> → Valor, <code>loja</code> →
                  Comerciante e <code>cartao</code> → o nome do cartão
                </li>
              </ul>
            </Step>

            <Step n={4} title="Opcional: veja o que entrou">
              <p>
                Adicione <b>Mostrar Notificação</b> com o <b>Conteúdo do URL</b>. A cada compra
                aparece algo como “Padaria · R$ 12,50 no Nubank”.
              </p>
            </Step>
          </ol>

          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}

          {active && (
            <button
              type="button"
              onClick={revoke}
              disabled={pending}
              className="self-start text-[13px] font-medium text-negative underline-offset-4 hover:underline disabled:opacity-50"
            >
              Desligar o lançamento automático
            </button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold tabular-nums"
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="font-semibold">{title}</p>
        {children}
      </div>
    </li>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl bg-(--field) py-1.5 pr-1.5 pl-3 ring-1 ring-(--hairline)">
      <span className="sr-only">{label}:</span>
      <code className="min-w-0 flex-1 truncate text-[13px]">{value}</code>
      <button
        type="button"
        aria-label={`Copiar ${label.toLowerCase()}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          } catch {
            // Sem permissão de área de transferência: o texto continua
            // selecionável no campo.
          }
        }}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 [&_svg]:size-4",
          copied ? "text-positive" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
    </div>
  );
}
