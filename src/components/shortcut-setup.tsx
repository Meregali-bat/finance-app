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
import type { ShortcutLanguage } from "@/lib/shortcut-language";

/**
 * O passo a passo nos dois idiomas. Os nomes em negrito são os dos menus do
 * iOS em cada idioma; os nomes dos campos do JSON (valor, loja, cartao) não
 * mudam, porque é o que o servidor lê.
 */
const COPY = {
  pt: {
    title: "Lançar automático pelo iPhone",
    intro:
      "Uma automação do app Atalhos manda cada pagamento por aproximação para cá. Só vale para o que passa pela Carteira: cartão físico e Pix continuam à mão, e compra parcelada entra à vista (dá para editar depois).",
    languageLabel: "Idioma do iPhone:",
    step1: "Gere a sua chave",
    keyLabel: "Chave",
    keyOnce:
      "Ela só aparece agora. Copie para o atalho antes de fechar; se perder, é só gerar outra.",
    keyExists: "Já existe uma chave ligada. Gerar outra faz o atalho com a antiga parar de lançar.",
    generate: "Gerar chave",
    generateNew: "Gerar nova chave",
    generating: "Gerando...",
    generateError: "Não deu para gerar a chave.",
    copy: "Copiar",
    step2: "Crie a automação",
    step2Body: (
      <>
        No app <b>Atalhos</b>, abra <b>Automação</b>, toque em <b>+</b> e escolha <b>Transação</b>.
        Marque os seus cartões, escolha <b>Executar Imediatamente</b> e siga para criar um atalho
        novo.
      </>
    ),
    step3: "Mande a compra para o app",
    step3Body: (
      <>
        Adicione a ação <b>Obter Conteúdo do URL</b>, toque na seta para ver mais opções e preencha:
      </>
    ),
    method: "Método:",
    headers: "Cabeçalhos:",
    headersBody: (
      <>
        chave <code>Authorization</code>, valor: a sua chave, colada como está
      </>
    ),
    body: "Corpo da Solicitação:",
    bodyBody: (
      <>
        JSON, com três campos de texto vindos da <b>Entrada do Atalho</b>: <code>valor</code> →
        Valor, <code>loja</code> → Comerciante e <code>cartao</code> → o nome do cartão
      </>
    ),
    step4: "Opcional: veja o que entrou",
    step4Body: (
      <>
        Adicione <b>Mostrar Notificação</b> com o <b>Conteúdo do URL</b>. A cada compra aparece algo
        como “Padaria · R$ 12,50 no Nubank”.
      </>
    ),
    turnOff: "Desligar o lançamento automático",
    turnOffError: "Não deu para desligar.",
  },
  en: {
    title: "Log purchases automatically from your iPhone",
    intro:
      "A Shortcuts automation sends every tap-to-pay purchase here. It only covers what goes through Wallet: the physical card and Pix are still logged by hand, and installment purchases come in as a single payment (you can edit them later).",
    languageLabel: "iPhone language:",
    step1: "Generate your key",
    keyLabel: "Key",
    keyOnce:
      "It's only shown now. Copy it into the shortcut before closing; if you lose it, just generate another one.",
    keyExists: "A key is already on. Generating a new one stops the shortcut with the old key.",
    generate: "Generate key",
    generateNew: "Generate new key",
    generating: "Generating...",
    generateError: "Couldn't generate the key.",
    copy: "Copy",
    step2: "Create the automation",
    step2Body: (
      <>
        In the <b>Shortcuts</b> app, open <b>Automation</b>, tap <b>+</b> and choose{" "}
        <b>Transaction</b>. Select your cards, choose <b>Run Immediately</b> and go on to create a
        new shortcut.
      </>
    ),
    step3: "Send the purchase to the app",
    step3Body: (
      <>
        Add the <b>Get Contents of URL</b> action, tap the arrow to show more options and fill in:
      </>
    ),
    method: "Method:",
    headers: "Headers:",
    headersBody: (
      <>
        key <code>Authorization</code>, value: your key, pasted as is
      </>
    ),
    body: "Request Body:",
    bodyBody: (
      <>
        JSON, with three text fields from <b>Shortcut Input</b>: <code>valor</code> → Amount,{" "}
        <code>loja</code> → Merchant and <code>cartao</code> → Card or Pass
      </>
    ),
    step4: "Optional: see what came in",
    step4Body: (
      <>
        Add <b>Show Notification</b> with <b>Contents of URL</b>. Each purchase shows something like
        “Padaria · R$ 12,50 no Nubank”.
      </>
    ),
    turnOff: "Turn off automatic logging",
    turnOffError: "Couldn't turn it off.",
  },
} satisfies Record<ShortcutLanguage, Record<string, React.ReactNode>>;

/**
 * O bloco "Lançar automático pelo iPhone" da tela Cartões: liga o atalho que
 * lança cada pagamento por aproximação (src/app/api/atalho). A chave só existe
 * em texto no momento em que é gerada; depois, o banco guarda só o hash.
 */
export function ShortcutSetup({
  active,
  endpoint,
  deviceLanguage,
}: {
  active: boolean;
  endpoint: string;
  /** O idioma do aparelho, do `Accept-Language`: só o passo a passo o segue. */
  deviceLanguage: ShortcutLanguage;
}) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<ShortcutLanguage>(deviceLanguage);
  const t = COPY[lang];
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      try {
        setToken(await generateShortcutToken());
      } catch (e) {
        setError(errorMessage(e, t.generateError));
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
        setError(errorMessage(e, t.turnOffError));
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
            <DialogTitle>{t.title}</DialogTitle>
            <DialogDescription>{t.intro}</DialogDescription>
          </DialogHeader>

          {/* Os nomes dos menus seguem o idioma do iPhone: em inglês lá, o
              passo a passo em inglês aqui, para achar cada botão pelo nome. */}
          <div
            role="group"
            aria-label={t.languageLabel}
            className="flex items-center gap-2 text-[13px] text-muted-foreground"
          >
            <span>{t.languageLabel}</span>
            <div className="flex rounded-full bg-muted p-0.5">
              {(["pt", "en"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={lang === option}
                  onClick={() => setLang(option)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-150",
                    lang === option
                      ? "bg-card text-foreground shadow-surface ring-1 ring-foreground/10"
                      : "hover:text-foreground",
                  )}
                >
                  {option === "pt" ? "Português" : "English"}
                </button>
              ))}
            </div>
          </div>

          <ol className="flex min-w-0 flex-col gap-4 text-sm">
            <Step n={1} title={t.step1}>
              {token ? (
                <>
                  <CopyField label={t.keyLabel} copyLabel={t.copy} value={token} />
                  <p className="text-[13px] text-muted-foreground">{t.keyOnce}</p>
                </>
              ) : (
                <>
                  {active && <p className="text-[13px] text-muted-foreground">{t.keyExists}</p>}
                  <Button
                    type="button"
                    variant={active ? "outline" : "default"}
                    onClick={generate}
                    disabled={pending}
                    className="self-start"
                  >
                    {pending ? t.generating : active ? t.generateNew : t.generate}
                  </Button>
                </>
              )}
            </Step>

            <Step n={2} title={t.step2}>
              <p>{t.step2Body}</p>
            </Step>

            <Step n={3} title={t.step3}>
              <p>{t.step3Body}</p>
              <CopyField label="URL" copyLabel={t.copy} value={endpoint} />
              <ul className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
                <li>
                  <b className="text-foreground">{t.method}</b> POST
                </li>
                <li>
                  <b className="text-foreground">{t.headers}</b> {t.headersBody}
                </li>
                <li>
                  <b className="text-foreground">{t.body}</b> {t.bodyBody}
                </li>
              </ul>
            </Step>

            <Step n={4} title={t.step4}>
              <p>{t.step4Body}</p>
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
              {t.turnOff}
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

function CopyField({
  label,
  copyLabel,
  value,
}: {
  label: string;
  copyLabel: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl bg-(--field) py-1.5 pr-1.5 pl-3 ring-1 ring-(--hairline)">
      <span className="sr-only">{label}:</span>
      <code className="min-w-0 flex-1 truncate text-[13px]">{value}</code>
      <button
        type="button"
        aria-label={`${copyLabel} ${label.toLowerCase()}`}
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
