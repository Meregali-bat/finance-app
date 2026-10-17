/**
 * A aparência de cada cartão na lista e no detalhe.
 *
 * Sem personalização, o degradê vem do id (não da posição): o cartão mantém a
 * cor quando outro é criado ou apagado. Personalizado, vem do catálogo abaixo
 * — banco e modelo do cartão de verdade. O catálogo mora no código, não numa
 * tabela: são poucos, e um banco novo entra quando alguém tiver o cartão.
 *
 * O texto sobre o cartão é sempre claro, então todo degradê aqui termina
 * escuro o bastante para o branco ler bem.
 */
const DEFAULT_GRADIENTS = [
  "linear-gradient(140deg,#5e0706 0%,#3a0c0b 60%,#290f0e 100%)",
  "linear-gradient(140deg,#4b2a12 0%,#2d1a10 60%,#1b1110 100%)",
  "linear-gradient(140deg,#2b2423 0%,#1f1817 60%,#1b1110 100%)",
  "linear-gradient(140deg,#6b0504 0%,#440b0a 60%,#290f0e 100%)",
];

export interface CardStyleOption {
  /** O que vai para o banco: "banco:modelo". */
  id: string;
  bank: string;
  model: string;
  gradient: string;
}

export const CARD_BANKS: { bank: string; models: CardStyleOption[] }[] = [
  {
    bank: "Nubank",
    models: [
      {
        id: "nubank:roxinho",
        bank: "Nubank",
        model: "Roxinho",
        gradient: "linear-gradient(140deg,#9a1ce6 0%,#820ad1 45%,#4f0583 100%)",
      },
      {
        id: "nubank:ultravioleta",
        bank: "Nubank",
        model: "Ultravioleta",
        gradient: "linear-gradient(140deg,#3b2257 0%,#1d1029 55%,#0b0610 100%)",
      },
      {
        id: "nubank:chroma",
        bank: "Nubank",
        model: "Chroma",
        gradient: "linear-gradient(140deg,#c86dd7 0%,#7b4fd6 30%,#3f6fd1 60%,#1a1840 100%)",
      },
    ],
  },
  {
    bank: "Sicoob",
    models: [
      {
        id: "sicoob:classico",
        bank: "Sicoob",
        model: "Sicoobcard Clássico",
        gradient: "linear-gradient(140deg,#00ae9d 0%,#00707a 50%,#003641 100%)",
      },
      {
        id: "sicoob:gold",
        bank: "Sicoob",
        model: "Sicoobcard Gold",
        gradient: "linear-gradient(140deg,#c9a24a 0%,#8a6a22 50%,#4a3710 100%)",
      },
      {
        id: "sicoob:platinum",
        bank: "Sicoob",
        model: "Sicoobcard Platinum",
        gradient: "linear-gradient(140deg,#9aa3a8 0%,#5d666b 50%,#2b3033 100%)",
      },
      {
        id: "sicoob:black",
        bank: "Sicoob",
        model: "Sicoobcard Black",
        gradient: "linear-gradient(140deg,#3a3a3a 0%,#1c1c1c 55%,#050505 100%)",
      },
    ],
  },
];

const BY_ID = new Map(CARD_BANKS.flatMap((b) => b.models).map((m) => [m.id, m]));

export function cardStyleOption(style: string | null | undefined): CardStyleOption | undefined {
  return style ? BY_ID.get(style) : undefined;
}

export function isCardStyle(style: string): boolean {
  return BY_ID.has(style);
}

export function cardGradient(id: string, style?: string | null): string {
  const custom = cardStyleOption(style);
  if (custom) return custom.gradient;
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return DEFAULT_GRADIENTS[hash % DEFAULT_GRADIENTS.length];
}
