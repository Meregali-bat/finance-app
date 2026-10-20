import { prisma } from "@/lib/prisma";
import { loadBudgetInputs } from "@/lib/budget-inputs";
import { dailyAlerts } from "@/lib/alerts";
import { pushConfigured, sendAlerts } from "@/lib/push";

/**
 * Os avisos da manhã, chamados pelo agendador da Vercel (vercel.json). A
 * Vercel manda `Authorization: Bearer <CRON_SECRET>`; sem o segredo certo,
 * ninguém dispara avisos de fora.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Não autorizado.", { status: 401 });
  }
  if (!pushConfigured()) return Response.json({ users: 0, sent: 0, skipped: "sem VAPID" });

  const users = await prisma.user.findMany({
    where: { pushSubscriptions: { some: {} } },
    select: { id: true },
  });
  const today = new Date();
  let sent = 0;
  for (const { id } of users) {
    try {
      const alerts = dailyAlerts(await loadBudgetInputs(id), today);
      sent += await sendAlerts(id, alerts);
    } catch (error) {
      // Um usuário com problema não pode impedir os avisos dos outros.
      console.error("Avisos da manhã falharam para um usuário", error);
    }
  }
  return Response.json({ users: users.length, sent });
}
