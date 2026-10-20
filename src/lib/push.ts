import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import type { Alert } from "@/lib/alerts";

/**
 * Manda avisos por Web Push. As chaves VAPID vêm do ambiente
 * (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e, opcional, VAPID_SUBJECT); sem elas,
 * os avisos ficam desligados e nada quebra.
 */
export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:avisos@leeway.app",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

/**
 * Manda cada aviso para todos os aparelhos do usuário. Um aparelho que o
 * serviço de push diz não existir mais (404/410) sai da lista.
 */
export async function sendAlerts(userId: string, alerts: Alert[]): Promise<number> {
  if (!pushConfigured() || alerts.length === 0) return 0;
  configure();
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  for (const sub of subscriptions) {
    for (const alert of alerts) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(alert),
          { TTL: 60 * 60 * 12 },
        );
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
          break;
        }
        console.error("Falha ao mandar aviso", status, error);
      }
    }
  }
  return sent;
}
