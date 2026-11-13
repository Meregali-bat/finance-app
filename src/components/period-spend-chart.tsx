import { addDays } from "date-fns";
import { formatCurrency } from "@/lib/format";

/**
 * O gasto do período, dia a dia, no desktop da Início: barras com o que saiu
 * em cada dia e, por cima, a curva do acumulado. O eixo vai do primeiro ao
 * último dia do período (de pagamento a pagamento, não um mês de calendário),
 * então os dias que ainda não chegaram ficam vazios à direita — o quanto do
 * período já passou se lê sem legenda. SVG puro, sem estado: cada barra leva
 * um `<title>` com o dia e os dois valores.
 */
export function PeriodSpendChart({
  cumulative,
  periodStart,
  totalDays,
}: {
  /** O acumulado de cada dia já vivido, do primeiro dia até hoje. */
  cumulative: number[];
  periodStart: Date;
  totalDays: number;
}) {
  const W = 640;
  const H = 220;
  const left = 64;
  const right = 12;
  const top = 12;
  const bottom = 28;
  const days = Math.max(1, totalDays);
  const daily = cumulative.map((v, i) => Math.max(0, v - (i > 0 ? cumulative[i - 1] : 0)));

  const peak = Math.max(1, ...cumulative);
  const step = niceStep(peak / 4);
  const max = Math.ceil(peak / step) * step;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);

  const slot = (W - left - right) / days;
  const x = (i: number) => left + slot * (i + 0.5);
  const y = (v: number) => H - bottom - (v / max) * (H - top - bottom);
  const barWidth = Math.min(14, Math.max(3, slot * 0.55));

  const line = cumulative.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
  const last = cumulative.length - 1;
  const area =
    last > 0 ? `${line} L${x(last)},${H - bottom} L${x(0)},${H - bottom} Z` : null;

  // Cinco marcas no eixo de baixo, sempre com o primeiro e o último dia.
  const labelDays = Array.from(new Set([0, 1, 2, 3, 4].map((k) => Math.round((k * (days - 1)) / 4))));
  const dayLabel = (i: number) => dayMonth.format(addDays(periodStart, i));

  // O balão do último dia fica do lado em que cabe.
  const tipWidth = 128;
  const tipX = last >= 0 && x(last) + tipWidth + 12 > W ? x(last) - tipWidth - 10 : x(last) + 10;
  const tipY = last >= 0 ? Math.max(top, Math.min(y(cumulative[last]) - 22, H - bottom - 48)) : 0;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="img"
      aria-label={
        last >= 0
          ? `Gasto acumulado no período: ${formatCurrency(cumulative[last])} até ${dayLabel(last)}`
          : "Nenhum gasto no período ainda"
      }
    >
      <defs>
        <linearGradient id="period-spend-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={left}
            x2={W - right}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--hairline-strong)"
            strokeDasharray={t === 0 ? undefined : "3 5"}
          />
          <text
            x={left - 10}
            y={y(t) + 4}
            textAnchor="end"
            fontSize="11"
            fill="var(--muted-foreground)"
            className="tabular-nums"
          >
            {compactCurrency(t)}
          </text>
        </g>
      ))}

      {daily.map((v, i) => (
        <rect
          key={i}
          x={x(i) - barWidth / 2}
          y={y(v)}
          width={barWidth}
          height={Math.max(0, H - bottom - y(v))}
          rx={Math.min(3, barWidth / 3)}
          fill="var(--primary)"
          opacity={0.26}
        >
          <title>{`${dayLabel(i)}: ${formatCurrency(v)} no dia · ${formatCurrency(cumulative[i])} no período`}</title>
        </rect>
      ))}

      {area && <path d={area} fill="url(#period-spend-area)" />}
      {last > 0 && (
        <path
          d={line}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {last >= 0 && (
        <g>
          <line
            x1={x(last)}
            x2={x(last)}
            y1={y(cumulative[last])}
            y2={H - bottom}
            stroke="var(--primary)"
            strokeDasharray="3 3"
            opacity="0.6"
          />
          <circle
            cx={x(last)}
            cy={y(cumulative[last])}
            r="5"
            fill="var(--card)"
            stroke="var(--primary)"
            strokeWidth="2.5"
          />
          <g transform={`translate(${tipX},${tipY})`}>
            <rect
              width={tipWidth}
              height="44"
              rx="10"
              fill="var(--card)"
              stroke="var(--hairline-strong)"
            />
            <text x="12" y="19" fontSize="12.5" fontWeight="700" fill="var(--foreground)" className="tabular-nums">
              {formatCurrency(cumulative[last])}
            </text>
            <text x="12" y="35" fontSize="11" fill="var(--muted-foreground)">
              {`até hoje, ${dayLabel(last)}`}
            </text>
          </g>
        </g>
      )}

      {labelDays.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={H - 8}
          textAnchor="middle"
          fontSize="11"
          fill="var(--muted-foreground)"
          className="tabular-nums"
        >
          {dayLabel(i)}
        </text>
      ))}
    </svg>
  );
}

/** "05/11": no mesmo fuso das outras datas da Início (`formatDate`). */
const dayMonth = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

/** O passo "redondo" do eixo: 1, 2, 2,5 ou 5 vezes uma potência de 10. */
function niceStep(raw: number) {
  const power = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / power;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * power;
}

/** "R$ 0", "R$ 750", "R$ 1,5 mil": o eixo não precisa de centavos. */
function compactCurrency(value: number) {
  if (value >= 1000)
    return `R$ ${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `R$ ${Math.round(value)}`;
}
