import { LogOut } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth-helpers";
import { currentAppearance } from "@/lib/theme-server";
import { logout } from "@/lib/actions/profile";
import { PageHeader, SectionLabel } from "@/components/page-header";
import { ProfileIdentity } from "@/components/profile-identity";
import { PalettePicker, ThemeSwitcher } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { PrivacySettings } from "@/components/privacy-settings";
import { loadConsents } from "@/lib/consent-store";
import { hasCurrentConsent, latestConsent } from "@/lib/legal";

export default async function ProfilePage() {
  const userId = await requireUserId();
  const [user, { theme, palette }, consents] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, email: true, avatar: true },
    }),
    currentAppearance(),
    loadConsents(userId),
  ]);
  const terms = latestConsent(consents, "terms");
  const ai = hasCurrentConsent(consents, "ai") ? latestConsent(consents, "ai") : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 lg:gap-6">
      <PageHeader title="Perfil" backHref="/" backLabel="Voltar ao Início" />

      <section
        aria-label="Você"
        className="rise-in rounded-[22px] bg-card p-[18px] shadow-(--shadow-card) lg:p-6"
        style={{ "--rise-delay": "40ms" } as React.CSSProperties}
      >
        <ProfileIdentity initialName={user.name} email={user.email} initialAvatar={user.avatar} />
      </section>

      <section
        aria-labelledby="aparencia"
        className="rise-in flex flex-col gap-5 rounded-[22px] bg-card p-[18px] shadow-(--shadow-card) lg:p-6"
        style={{ "--rise-delay": "80ms" } as React.CSSProperties}
      >
        <div className="flex flex-col gap-1">
          <SectionLabel id="aparencia">Aparência</SectionLabel>
          <p className="text-[13px] text-muted-foreground">
            Fica salva na sua conta e vale em todo aparelho em que você entrar.
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <p className="text-[13px] font-semibold">Cor</p>
          <PalettePicker initial={palette} />
        </div>
        <div className="flex flex-col gap-2.5">
          <p className="text-[13px] font-semibold">Modo</p>
          <ThemeSwitcher initial={theme} />
        </div>
      </section>

      <section
        aria-labelledby="privacidade"
        className="rise-in flex flex-col gap-4 rounded-[22px] bg-card p-[18px] shadow-(--shadow-card) lg:p-6"
        style={{ "--rise-delay": "120ms" } as React.CSSProperties}
      >
        <SectionLabel id="privacidade">Privacidade e dados</SectionLabel>
        <PrivacySettings
          termsAcceptedAt={terms?.createdAt.toISOString() ?? null}
          aiGrantedAt={ai?.createdAt.toISOString() ?? null}
        />
      </section>

      <form
        action={logout}
        className="rise-in flex justify-center pt-1"
        style={{ "--rise-delay": "160ms" } as React.CSSProperties}
      >
        <Button type="submit" variant="ghost" className="text-muted-foreground">
          <LogOut aria-hidden="true" />
          Sair da conta
        </Button>
      </form>
    </div>
  );
}
