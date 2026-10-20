import { cn } from "@/lib/utils";

export type IconTone = "neutral" | "accent" | "positive" | "negative";

const TONE: Record<IconTone, string> = {
  neutral: "bg-muted text-primary",
  accent: "bg-primary/12 text-primary",
  positive: "bg-positive/12 text-positive",
  negative: "bg-negative/10 text-negative",
};

/** O quadrado de ícone que abre cada linha de lista: 34px, raio 11. */
export function IconSquare({
  tone = "neutral",
  children,
  className,
}: {
  tone?: IconTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-[34px] shrink-0 items-center justify-center rounded-[11px] [&_svg]:size-4",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A superfície de uma linha de lista: raio 18, café, anel de 1px por dentro. */
export function listRowSurface(className?: string) {
  return cn(
    "rounded-[18px] bg-card py-3 pr-3.5 pl-3 shadow-[inset_0_0_0_1px_var(--hairline)]",
    className,
  );
}

/**
 * Uma linha de lista: ícone, título e subtítulo à esquerda, valor e ações à
 * direita. Substitui o `Card` com faixa lateral — o tipo agora vem do ícone.
 */
export function ListRow({
  icon,
  tone,
  title,
  subtitle,
  value,
  valueClassName,
  trailing,
  className,
  style,
  dim,
  children,
}: {
  icon?: React.ReactNode;
  tone?: IconTone;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  value?: React.ReactNode;
  valueClassName?: string;
  /** Ações à direita do valor (botões-ícone, chevron). */
  trailing?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Desligado (renda ou despesa inativa): o texto cai para metade. */
  dim?: boolean;
  /** Um bloco extra embaixo da linha (o adiamento de uma despesa, por exemplo). */
  children?: React.ReactNode;
}) {
  return (
    <div className={listRowSurface(cn("flex flex-col gap-2.5", className))} style={style}>
      <div className="flex items-center gap-3">
        {icon && <IconSquare tone={tone}>{icon}</IconSquare>}
        <div className={cn("min-w-0 flex-1 transition-opacity", dim && "opacity-50")}>
          <p className="truncate text-[14.5px] font-semibold">{title}</p>
          {subtitle && (
            <p className="text-[12.5px] text-muted-foreground">
              {typeof subtitle === "string" ? <SubtitleParts text={subtitle} /> : subtitle}
            </p>
          )}
        </div>
        {value !== undefined && (
          <span className={cn("shrink-0 text-[14.5px] font-semibold tabular-nums", valueClassName)}>
            {value}
          </span>
        )}
        {trailing && <div className="flex shrink-0 items-center gap-0.5">{trailing}</div>}
      </div>
      {children}
    </div>
  );
}

/** O atraso de entrada de um item de lista, lido pelo `.rise-in`. */
export function stagger(index: number, base = 80, step = 45) {
  return { "--rise-delay": `${base + index * step}ms` } as React.CSSProperties;
}

/**
 * "12/08/26 · 3x de R$ 400,00" quebrando só entre as partes: cada uma fica
 * inteira numa linha, e a quebra nunca separa "de" do valor.
 */
export function SubtitleParts({ text }: { text: string }) {
  return text.split(" · ").map((part, i) => (
    <span key={i}>
      {i > 0 && " · "}
      {/* Parte longa demais para uma linha estreita quebra normalmente. */}
      <span className={part.length <= 24 ? "whitespace-nowrap" : undefined}>{part}</span>
    </span>
  ));
}
