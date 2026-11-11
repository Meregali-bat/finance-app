import {
  CardSkeleton,
  HeaderSkeleton,
  PickerSkeleton,
  ScreenSkeleton,
} from "@/components/screen-skeleton";

/** Cabeçalho, seletor de ciclo, o card do ciclo e os blocos de baixo. */
export default function PrevisaoLoading() {
  return (
    <ScreenSkeleton label="Carregando a Previsão" className="gap-6">
      <HeaderSkeleton subtitle />
      <PickerSkeleton />
      <CardSkeleton className="h-[462px] rounded-[26px] lg:h-[257px] lg:rounded-[28px]" />
      <CardSkeleton className="h-[173px] lg:h-[105px]" />
      <CardSkeleton className="h-[435px] lg:h-[280px]" />
    </ScreenSkeleton>
  );
}
