import { Logo } from "@/components/logo";

/**
 * O primeiro uso fica fora do app: sem a barra lateral nem a inferior, só a
 * marca e uma coluna estreita — é uma tarefa com começo, meio e fim.
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen w-full flex-col items-center px-5 pt-[max(1.5rem,calc(env(safe-area-inset-top)+1rem))] pb-10">
      <div aria-hidden="true" className="app-backdrop" />
      <div className="flex w-full max-w-[34rem] flex-col gap-8">
        <Logo size="sm" />
        {children}
      </div>
    </div>
  );
}
