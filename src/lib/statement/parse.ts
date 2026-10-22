import {
  parseNubankStatement,
  type ParsedStatement,
  type PdfTextItem,
} from "@/lib/statement/nubank";
import { isBanrisulStatement, parseBanrisulStatement } from "@/lib/statement/banrisul";
import { isSicoobStatement, parseSicoobStatement } from "@/lib/statement/sicoob";

/** Lê o extrato do banco que ele for: Sicoob e Banrisul pelo cabeçalho, senão Nubank. */
export function parseStatement(pages: PdfTextItem[][]): ParsedStatement & {
  bank: "nubank" | "sicoob" | "banrisul";
} {
  if (isSicoobStatement(pages)) return { ...parseSicoobStatement(pages), bank: "sicoob" };
  if (isBanrisulStatement(pages)) return { ...parseBanrisulStatement(pages), bank: "banrisul" };
  return { ...parseNubankStatement(pages), bank: "nubank" };
}
