"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { homeCard } from "@/components/home-card";
import { deletePushSubscription, savePushSubscription, sendTestAlert } from "@/lib/actions/push";
import { errorMessage } from "@/lib/error-message";

type State =
  | "loading"
  | "hidden" // navegador sem avisos e sem nada a ensinar
  | "install" // iPhone fora do app da tela de início: lá os avisos não existem
  | "unsupported" // iPhone no app, mas num iOS sem avisos (antes do 16.4)
  | "denied"
  | "off"
  | "on";

/**
 * Ligar os avisos neste aparelho. Só aparece depois de montar: tudo que decide
 * o estado (permissão, service worker, modo app) existe só no navegador.
 */
export function PushSetup({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function detect(): Promise<State> {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!ios) return "hidden";
        return standalone ? "unsupported" : "install";
      }
      if (Notification.permission === "denied") return "denied";
      const registration = await withTimeout(
        navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }),
        8000,
      );
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        // Mantém o servidor em dia com este aparelho (o endereço pode ter mudado).
        await savePushSubscription(subscription.toJSON());
        return "on";
      }
      return "off";
    }
    detect()
      .then((next) => !cancelled && setState(next))
      // Um erro aqui não esconde o bloco: ele aparece com o motivo, e o
      // "Ligar avisos" tenta de novo do zero.
      .catch((e) => {
        if (cancelled) return;
        setError(`Não deu para preparar os avisos (${errorMessage(e, "erro desconhecido")}).`);
        setState("off");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function enable() {
    setError(null);
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(publicKey),
        });
        await savePushSubscription(subscription.toJSON());
        await sendTestAlert();
        setState("on");
      } catch (e) {
        setError(errorMessage(e, "Não deu para ligar os avisos."));
      }
    });
  }

  function disable() {
    setError(null);
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await deletePushSubscription(subscription.endpoint);
          await subscription.unsubscribe();
        }
        setState("off");
      } catch (e) {
        setError(errorMessage(e, "Não deu para desligar os avisos."));
      }
    });
  }

  if (state === "loading" || state === "hidden") return null;

  if (state === "on") {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
        <Bell className="size-4 text-positive" aria-hidden="true" />
        Avisos ligados neste aparelho.
        <button
          type="button"
          onClick={disable}
          disabled={pending}
          className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
        >
          Desligar
        </button>
        {error && (
          <span role="alert" className="w-full text-negative">
            {error}
          </span>
        )}
      </p>
    );
  }

  const copy = {
    install: {
      text: "Para receber avisos, abra o app pelo ícone na tela de início. No Safari, toque em Compartilhar → Adicionar à Tela de Início.",
      action: false,
    },
    unsupported: {
      text: "Este iPhone não recebe avisos de apps da tela de início. Atualize o iOS (16.4 ou mais novo) e volte aqui.",
      action: false,
    },
    denied: {
      text: "Os avisos estão bloqueados. Libere em Ajustes → Notificações → Finanças e volte aqui.",
      action: false,
    },
    off: {
      text: "Conta que vence amanhã, fatura que vence ou fecha hoje, salário para confirmar e quando passar do limite do dia.",
      action: true,
    },
  }[state];

  return (
    <div className={homeCard("flex flex-wrap items-center gap-x-4 gap-y-3")}>
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary"
      >
        {state === "denied" ? <BellOff className="size-5" /> : <Bell className="size-5" />}
      </span>
      <div className="min-w-[12rem] flex-1">
        <p className="font-heading text-[15px] font-semibold">Avisos no celular</p>
        <p className="text-[13px] text-muted-foreground">{copy.text}</p>
        {error && (
          <p role="alert" className="mt-1 text-[13px] text-negative">
            {error}
          </p>
        )}
      </div>
      {copy.action && (
        <Button type="button" onClick={enable} disabled={pending} className="w-full sm:w-auto">
          {pending ? "Ligando..." : "Ligar avisos"}
        </Button>
      )}
    </div>
  );
}

/** A chave pública VAPID, em base64url, como o PushManager pede. */
function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = window.atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Uma promessa que desiste depois de `ms`, para o bloco nunca ficar preso carregando. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      window.setTimeout(() => reject(new Error("demorou demais para responder")), ms),
    ),
  ]);
}
