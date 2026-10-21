import {
  parseNubankStatement,
  type ParsedStatement,
  type PdfTextItem,
} from "@/lib/statement/nubank";
import { isSicoobStatement, parseSicoobStatement } from "@/lib/statement/sicoob";

/** Lê o extrato do banco que ele for: Sicoob pelo cabeçalho, senão Nubank. */
export function parseStatement(pages: PdfTextItem[][]): ParsedStatement & {
  bank: "nubank" | "sicoob";
} {
  return isSicoobStatement(pages)
    ? { ...parseSicoobStatement(pages), bank: "sicoob" }
    : { ...parseNubankStatement(pages), bank: "nubank" };
}
