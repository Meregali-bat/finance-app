import { BottomNav } from "@/components/bottom-nav";
import { SidebarNav } from "@/components/sidebar-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <SidebarNav />
      {/* O mesmo elemento serve aos dois modos: `flex-1` ocupa o que sobra ao
          lado da barra lateral, o `max-w-*` limita e as margens automáticas
          centralizam a coluna dentro desse espaço. */}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-24 pt-6 lg:max-w-[68rem] lg:px-8 lg:py-10 2xl:max-w-[96rem]">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
