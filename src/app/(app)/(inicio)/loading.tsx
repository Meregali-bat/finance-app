import { BarSkeleton, CardSkeleton, RowsSkeleton, ScreenSkeleton } from "@/components/screen-skeleton";

/**
 * O esqueleto da Início, nas medidas da tela: o cabeçalho (logo e data no
 * celular, dia da semana no desktop), o card de destaque e, abaixo, a lista do
 * dia. O respiro de baixo é o da página real.
 */
export default function InicioLoading() {
  return (
    <ScreenSkeleton
      label="Carregando a Início"
      className="pb-[calc(env(safe-area-inset-bottom)+3rem)] lg:pb-0"
    >
      <div aria-hidden="true" className="flex h-11 items-center justify-between gap-4 lg:hidden">
        <BarSkeleton className="h-6 w-24" />
        <div className="-mr-1 flex items-center gap-3">
          <BarSkeleton className="h-4 w-24" />
          <BarSkeleton className="size-9 rounded-full" />
        </div>
      </div>
      <div aria-hidden="true" className="hidden h-12 flex-col justify-end gap-2 lg:flex">
        <BarSkeleton className="h-3.5 w-20" />
        <BarSkeleton className="h-[22px] w-40" />
      </div>
      <CardSkeleton className="h-[430px] rounded-[26px] lg:h-[381px] lg:rounded-[28px]" />
      <div aria-hidden="true" className="flex flex-col gap-3">
        <BarSkeleton className="h-[18px] w-32" />
        <RowsSkeleton count={3} rowClassName="h-[72px]" />
      </div>
      <div aria-hidden="true" className="flex flex-col gap-3">
        <BarSkeleton className="h-[18px] w-40" />
        <RowsSkeleton count={3} rowClassName="h-[72px]" />
      </div>
    </ScreenSkeleton>
  );
}
