import { describe, expect, it } from "vitest";
import { reviewFixes, type AppRecord, type RawIssue } from "./review-issues";

const records: AppRecord[] = [
  { id: "posto", date: "2026-10-19", description: "Pix para Posto Roda Mais", amount: 45.9 },
  { id: "pj", date: "2026-10-05", description: "Pix de Lucas MEI", amount: -2000 },
  { id: "spotify", date: "2026-10-10", description: "Spotify", amount: 21.9 },
];
const issue = (overrides: Partial<RawIssue>): RawIssue => ({
  kind: "amount",
  transactionId: "posto",
  statementDate: "2026-10-19",
  statementDescription: "PIX ENVIADO POSTO RODA MAIS",
  statementAmount: 459,
  explanation: "O extrato mostra R$ 459,00.",
  ...overrides,
});

describe("reviewFixes", () => {
  it("valor diferente vira troca de valor, mantendo o sentido do lançamento", () => {
    const [fix] = reviewFixes([issue({})], records);
    expect(fix.fix).toEqual({ type: "amount", amount: 459 });
    const [income] = reviewFixes(
      [issue({ transactionId: "pj", statementAmount: 2500 })],
      records,
    );
    expect(income.fix).toEqual({ type: "amount", amount: -2500 });
  });

  it("transferência própria e duplicado viram apagar; sentido trocado inverte", () => {
    const fixes = reviewFixes(
      [
        issue({ kind: "ownTransfer", transactionId: "pj" }),
        issue({ kind: "duplicate", transactionId: "spotify" }),
        issue({ kind: "direction", transactionId: "posto" }),
      ],
      records,
    );
    expect(fixes.map((f) => f.fix)).toEqual([
      { type: "delete" },
      { type: "delete" },
      { type: "amount", amount: -45.9 },
    ]);
  });

  it("descarta lançamento desconhecido, valor que já bate e o repetido", () => {
    const fixes = reviewFixes(
      [
        issue({ transactionId: "inventado" }),
        issue({ transactionId: "spotify", statementAmount: 21.9 }),
        issue({}),
        issue({ kind: "duplicate" }),
      ],
      records,
    );
    expect(fixes).toHaveLength(1);
    expect(fixes[0].record?.id).toBe("posto");
  });

  it("outra coisa só explica, sem correção", () => {
    const [fix] = reviewFixes([issue({ kind: "other", transactionId: null })], records);
    expect(fix.fix).toBeNull();
    expect(fix.record).toBeNull();
  });
});
