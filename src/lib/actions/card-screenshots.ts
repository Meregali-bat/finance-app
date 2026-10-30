"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { Refusal, refusing } from "@/lib/action-result";
import { categoryFromHistory } from "@/lib/category-from-history";
import {
  keepFingerprint,
  linkedAmount,
  prepareShotLines,
  reconcileShots,
  type AppPurchase,
  type ShotLine,
} from "@/lib/statement/card-screenshots";
import { readCardScreenshots, type ShotImage } from "@/lib/statement/read-screenshots";

export interface ShotAnalysis {
  period: { start: string; end: string };
  bankTotal: number;
  appTotal: number;
  /** Quantas compras das prints já estavam no app. */
  matched: number;
  /** Negadas, canceladas, desconhecidas e o que não é compra. */
  skipped: number;
  /** Diferenças ignoradas ou mantidas numa conferência anterior. */
  resolvedBefore: number;
  onlyBank: (ShotLine & { categoryId: string | null })[];
  onlyApp: AppPurchase[];
}

const DAY = 86_400_000;
const MAX_IMAGES = 20;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const iso = (d: Date) => d.toISOString().slice(0, 10);

function revalidateCard(cardId: string) {
  revalidatePath(`/cartoes/${cardId}`);
  revalidatePath("/cartoes");
  revalidatePath("/");
  revalidatePath("/historico");
}

async function ownCard(userId: string, cardId: string) {
  const card = await prisma.creditCard.findFirst({
    where: { id: cardId, userId, deletedAt: null },
    select: { id: true },
  });
  if (!card) throw new Refusal("Cartão não encontrado.");
  return card.id;
}

/**
 * Lê as prints da tela de lançamentos do banco e concilia com as compras do
 * cartão. Não grava nada: cada diferença é resolvida por uma action abaixo.
 */
export async function analyzeCardScreenshots(cardId: string, formData: FormData) {
  return refusing(async (): Promise<ShotAnalysis> => {
    const userId = await requireUserId();
    await ownCard(userId, cardId);
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Refusal("A leitura de prints não está configurada (falta ANTHROPIC_API_KEY).");
    }
    const files = formData.getAll("images").filter((f): f is File => f instanceof File);
    if (files.length === 0) throw new Refusal("Escolha as prints da tela de lançamentos.");
    if (files.length > MAX_IMAGES) throw new Refusal(`Mande no máximo ${MAX_IMAGES} prints.`);
    const images: ShotImage[] = [];
    for (const file of files) {
      if (!TYPES.has(file.type)) throw new Refusal("As prints precisam ser imagens (JPG ou PNG).");
      images.push({
        mediaType: file.type as ShotImage["mediaType"],
        data: Buffer.from(await file.arrayBuffer()).toString("base64"),
      });
    }

    const { lines, skipped } = prepareShotLines(await readCardScreenshots(images), cardId, new Date());
    if (lines.length === 0) throw new Refusal("Não achei compras nessas prints.");

    // Um pouco além do período: a conferência aceita até 3 dias de diferença.
    const dates = lines.map((l) => l.date).sort();
    const from = new Date(Date.parse(`${dates[0]}T00:00:00.000Z`) - 3 * DAY);
    const to = new Date(Date.parse(`${dates[dates.length - 1]}T00:00:00.000Z`) + 4 * DAY);
    const [purchases, ignores] = await Promise.all([
      prisma.cardPurchase.findMany({
        where: { userId, cardId, date: { gte: from, lt: to } },
        select: { id: true, description: true, date: true, amount: true, installments: true },
      }),
      prisma.statementIgnore.findMany({ where: { userId }, select: { fingerprint: true } }),
    ]);
    const result = reconcileShots(
      lines,
      purchases.map((p) => ({
        id: p.id,
        description: p.description,
        date: iso(p.date),
        amount: Number(p.amount),
        installments: p.installments,
      })),
    );

    const resolved = new Set(ignores.map((i) => i.fingerprint));
    const onlyBank = result.onlyBank.filter((l) => !resolved.has(l.fingerprint));
    const onlyApp = result.onlyApp.filter((p) => !resolved.has(keepFingerprint(p.id)));
    return {
      period: result.period,
      bankTotal: result.bankTotal,
      appTotal: result.appTotal,
      matched: result.matched.length,
      skipped,
      resolvedBefore:
        result.onlyBank.length - onlyBank.length + result.onlyApp.length - onlyApp.length,
      onlyBank: await Promise.all(
        onlyBank.map(async (l) => ({
          ...l,
          categoryId: await categoryFromHistory(userId, titleCase(l.description)),
        })),
      ),
      onlyApp,
    };
  });
}

const LOWER = new Set(["de", "da", "do", "das", "dos", "e"]);
function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => (i > 0 && LOWER.has(word) ? word : word[0].toUpperCase() + word.slice(1)))
    .join(" ")
    .slice(0, 120);
}

const lineSchema = z.object({
  date: z.iso.date(),
  description: z.string().trim().min(1).max(200),
  amount: z.number().positive(),
  categoryId: z.string().nullable(),
});

/** "Adicionar": a linha do banco vira uma compra à vista no cartão. */
export async function addShotPurchase(cardId: string, input: unknown) {
  return refusing(async () => {
    const userId = await requireUserId();
    await ownCard(userId, cardId);
    const line = lineSchema.parse(input);
    const category = line.categoryId
      ? await prisma.category.findFirst({ where: { id: line.categoryId, userId }, select: { id: true } })
      : null;
    await prisma.cardPurchase.create({
      data: {
        userId,
        cardId,
        description: titleCase(line.description) || "Compra no cartão",
        amount: line.amount,
        installments: 1,
        date: new Date(`${line.date}T00:00:00.000Z`),
        categoryId: category?.id ?? null,
      },
    });
    revalidateCard(cardId);
    return { ok: true as const };
  });
}

/** "Ignorar" uma linha do banco, ou "Manter" uma compra do app: não volta nas próximas conferências. */
export async function rememberShotDecision(fingerprint: string) {
  return refusing(async () => {
    const userId = await requireUserId();
    const value = z.string().min(1).max(300).parse(fingerprint);
    await prisma.statementIgnore.createMany({
      data: [{ userId, fingerprint: value }],
      skipDuplicates: true,
    });
    return { ok: true as const };
  });
}

/**
 * "Ligar" uma compra do app a uma linha do banco: o valor do app passa a ser
 * o do banco (parcelada, a linha é a parcela). Um empréstimo do valor inteiro
 * da compra acompanha; dividido entre pessoas, fica como está.
 */
export async function linkShot(cardId: string, purchaseId: string, lineAmount: number) {
  return refusing(async () => {
    const userId = await requireUserId();
    const purchase = await prisma.cardPurchase.findFirst({
      where: { id: purchaseId, userId, cardId },
      select: { amount: true, installments: true, loans: { select: { id: true, amount: true } } },
    });
    if (!purchase) throw new Refusal("Compra não encontrada.");
    const amount = linkedAmount(z.number().positive().parse(lineAmount), purchase.installments);
    const whole =
      purchase.loans.length === 1 && Number(purchase.loans[0].amount) === Number(purchase.amount)
        ? purchase.loans[0]
        : null;
    await prisma.$transaction([
      prisma.cardPurchase.update({ where: { id: purchaseId, userId }, data: { amount } }),
      ...(whole ? [prisma.loan.update({ where: { id: whole.id }, data: { amount } })] : []),
    ]);
    revalidateCard(cardId);
    return { amount };
  });
}
