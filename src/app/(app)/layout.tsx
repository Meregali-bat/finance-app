import { BottomNav } from "@/components/bottom-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-24 pt-6">{children}</main>
      <BottomNav />
    </div>
  );
}
