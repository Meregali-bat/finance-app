import {
  CardSkeleton,
  HeaderSkeleton,
  RowsSkeleton,
  ScreenSkeleton,
} from "@/components/screen-skeleton";

/** Cabeçalho, a faixa de totais (três números) e as linhas de contas fixas. */
export default function RendasLoading() {
  return (
    <ScreenSkeleton label="Carregando os Fixos">
      <HeaderSkeleton subtitle />
      <CardSkeleton className="h-[177px] sm:h-[97px]" />
      <RowsSkeleton count={4} />
    </ScreenSkeleton>
  );
}
