import { BottomNav } from "@/components/bottom-nav";
import { SidebarNav } from "@/components/sidebar-nav";
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardedAt: true, name: true, email: true, avatar: true },
  });
  // Conta nova, que ainda não terminou o primeiro uso: sem renda não existe
  // "quanto posso gastar hoje", então o app começa pelo passo a passo.
  if (!user?.onboardedAt) redirect("/comecar");
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div aria-hidden="true" className="app-backdrop" />
      <SidebarNav user={{ name: user.name, email: user.email, avatar: user.avatar }} />
      {/* O mesmo elemento serve aos dois modos: `flex-1` ocupa o que sobra ao
          lado da barra lateral, o `max-w-*` limita e as margens automáticas
          centralizam a coluna dentro desse espaço. */}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-24 pt-[max(1.5rem,calc(env(safe-area-inset-top)+0.75rem))] lg:max-w-[68rem] lg:px-8 lg:py-10 2xl:max-w-[96rem]">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
