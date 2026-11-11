import {
  CardSkeleton,
  HeaderSkeleton,
  ScreenSkeleton,
} from "@/components/screen-skeleton";

/** Cabeçalho, a faixa do total guardado e a grade de caixinhas. */
export default function CaixinhasLoading() {
  return (
    <ScreenSkeleton label="Carregando as Caixinhas">
      <HeaderSkeleton subtitle action />
      <CardSkeleton className="h-[63px]" />
      <div aria-hidden="true" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <CardSkeleton key={i} className="h-[207px]" />
        ))}
      </div>
    </ScreenSkeleton>
  );
}
