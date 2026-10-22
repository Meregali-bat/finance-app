import { FALLBACK_CDI_ANNUAL_PERCENT } from "@/lib/jar-yield";

export interface CdiRate {
  /** Ao ano, em % (14,9 = 14,9% a.a.). */
  annualPercent: number;
  /** "21/10/2026", o dia da taxa publicada; nulo na estimativa. */
  date: string | null;
  /** Do Banco Central, ou o valor de reserva quando não deu para buscar. */
  source: "bcb" | "estimate";
}

/**
 * A taxa DI anualizada (base 252) do Banco Central, série 4389 do SGS. Uma vez
 * por dia basta: ela muda no máximo uma vez por dia útil. Fora do ar, o app
 * segue com a estimativa — e a tela diz que é estimativa, num campo que a
 * pessoa corrige.
 */
export async function currentCdi(): Promise<CdiRate> {
  try {
    const response = await fetch(
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json",
      { next: { revalidate: 60 * 60 * 12 }, signal: AbortSignal.timeout(3000) },
    );
    if (!response.ok) throw new Error(String(response.status));
    const [last] = (await response.json()) as { data: string; valor: string }[];
    const annualPercent = Number(String(last?.valor).replace(",", "."));
    if (!Number.isFinite(annualPercent) || annualPercent <= 0 || annualPercent > 100) {
      throw new Error("taxa inválida");
    }
    return { annualPercent, date: last.data, source: "bcb" };
  } catch {
    return { annualPercent: FALLBACK_CDI_ANNUAL_PERCENT, date: null, source: "estimate" };
  }
}
