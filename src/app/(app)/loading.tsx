import { CardSkeleton, HeaderSkeleton, RowsSkeleton, ScreenSkeleton } from "@/components/screen-skeleton";

/**
 * A reserva das subtelas sem esqueleto próprio (importar, ajustar metas,
 * empréstimos...): cabeçalho, um card e linhas, que é a forma da maioria.
 */
export default function AppLoading() {
  return (
    <ScreenSkeleton>
      <HeaderSkeleton subtitle />
      <CardSkeleton className="h-40 lg:h-32" />
      <RowsSkeleton count={4} />
    </ScreenSkeleton>
  );
}
