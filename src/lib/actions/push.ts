"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { sendAlerts } from "@/lib/push";

const subscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

/** Guarda o aparelho que aceitou os avisos. O mesmo endereço troca de dono. */
export async function savePushSubscription(subscription: unknown) {
  const userId = await requireUserId();
  const { endpoint, keys } = subscriptionSchema.parse(subscription);
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId, p256dh: keys.p256dh, auth: keys.auth },
  });
}

/** Esquece um aparelho: os avisos param de chegar nele. */
export async function deletePushSubscription(endpoint: string) {
  const userId = await requireUserId();
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
}

/** O primeiro aviso, logo depois de ligar: confirma que chegam neste aparelho. */
export async function sendTestAlert() {
  const userId = await requireUserId();
  await sendAlerts(userId, [
    {
      title: "Avisos ligados",
      body: "Você vai ver aqui as contas que vencem e quando passar do limite do dia.",
      url: "/",
      tag: "push-on",
    },
  ]);
}
