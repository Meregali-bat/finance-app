import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { loadBudgetInputs } from "@/lib/budget-inputs";
import { overspendAlert } from "@/lib/alerts";
import { sendAlerts } from "@/lib/push";
import { categoryFromHistory } from "@/lib/category-from-history";
import {
  calendarToday,
  hashShortcutToken,
  matchCard,
  normalizeName,
  parseShortcutAmount,
  shortcutDescription,
  walletCardText,
} from "@/lib/shortcut";

/**
 * Recebe uma compra do atalho do iPhone. A automação "Carteira" (antes "Transação") do app
 * Atalhos dispara a cada pagamento por aproximação e manda, em JSON,
 * `{ valor, loja, cartao }`, com a chave pessoal no cabeçalho
 * `Authorization: <chave>` (com ou sem o "Bearer " na frente).
 *
 * A resposta é texto curto, porque o atalho a mostra numa notificação:
 * "Padaria · R$ 12,50 no Nubank".
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return reply(401, "Falta a chave do atalho.");

  const user = await prisma.user.findUnique({
    where: { shortcutTokenHash: hashShortcutToken(token) },
    select: { id: true },
  });
  if (!user) return reply(401, "Chave do atalho inválida. Gere uma nova em Cartões.");

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return reply(400, "O atalho não mandou um JSON válido.");
  }

  const amount = parseShortcutAmount(body.valor);
  if (amount === null) return reply(400, "Não deu para ler o valor da compra.");

  const cards = await prisma.creditCard.findMany({
    where: { userId: user.id, deletedAt: null, active: true },
    select: { id: true, name: true },
  });
  const walletName = walletCardText(body.cartao);
  const normalized = walletName ? normalizeName(walletName) : "";
  // A escolha da pessoa em Cartões vale mais que o palpite pelo nome.
  const alias = normalized
    ? await prisma.walletCardAlias.findUnique({
        where: { userId_normalized: { userId: user.id, normalized } },
        select: { cardId: true, asAccount: true },
      })
    : null;
  const card = alias?.asAccount
    ? null
    : (cards.find((c) => c.id === alias?.cardId) ?? matchCard(walletName, cards));
  // Sem cartão e sem resposta ainda: guarda o nome para Cartões perguntar.
  const unknownCard = !card && !alias?.asAccount && walletName !== null && normalized !== "";
  if (unknownCard && !alias) {
    await prisma.walletCardAlias.upsert({
      where: { userId_normalized: { userId: user.id, normalized } },
      create: { userId: user.id, walletName, normalized },
      update: {},
    });
  }
  const description = shortcutDescription(body.loja, card?.name ?? null);
  const categoryId = await categoryFromHistory(user.id, description);
  const date = calendarToday(new Date());

  if (card) {
    await prisma.cardPurchase.create({
      data: { userId: user.id, cardId: card.id, amount, description, date, categoryId },
    });
    revalidatePath(`/cartoes/${card.id}`);
    revalidatePath("/cartoes");
  } else {
    await prisma.transaction.create({
      data: {
        userId: user.id,
        amount,
        description,
        date,
        categoryId,
        walletCardName: unknownCard ? walletName : null,
      },
    });
    if (unknownCard) revalidatePath("/cartoes");
  }
  revalidatePath("/");
  revalidatePath("/historico");

  // Depois da resposta, para o atalho não esperar: se a compra passou do
  // limite de hoje, avisa no celular.
  const userId = user.id;
  after(async () => {
    try {
      const alert = overspendAlert(await loadBudgetInputs(userId), new Date());
      if (alert) await sendAlerts(userId, [alert]);
    } catch (error) {
      console.error("Aviso de limite falhou", error);
    }
  });

  const where = card
    ? ` no ${card.name}`
    : unknownCard
      ? `. Cartão “${walletName}” não reconhecido: entrou como gasto da conta; escolha o cartão em Cartões`
      : !walletName
        ? ". O atalho não mandou o nome do cartão: entrou como gasto da conta"
        : "";
  return reply(201, `${description} · ${formatCurrency(amount)}${where}`);
}

function reply(status: number, message: string) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
