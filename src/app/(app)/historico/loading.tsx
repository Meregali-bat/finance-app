import {
  CardSkeleton,
  HeaderSkeleton,
  PickerSkeleton,
  RowsSkeleton,
  ScreenSkeleton,
} from "@/components/screen-skeleton";

/** Cabeçalho com ações, seletor de mês, o resumo, o gráfico e a lista de lançamentos. */
export default function HistoricoLoading() {
  return (
    <ScreenSkeleton label="Carregando o Histórico" className="gap-6">
      <HeaderSkeleton action className="lg:h-[38px]" />
      <PickerSkeleton />
      <CardSkeleton className="h-[188px] lg:h-[100px]" />
      <CardSkeleton className="h-[521px] lg:h-[568px]" />
      <RowsSkeleton count={6} />
    </ScreenSkeleton>
  );
}
