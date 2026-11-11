import {
  CardSkeleton,
  HeaderSkeleton,
  RowsSkeleton,
  ScreenSkeleton,
} from "@/components/screen-skeleton";

/** Cabeçalho, os dois cards do topo (renda e fatias) e a lista de fatias. */
export default function MetasLoading() {
  return (
    <ScreenSkeleton label="Carregando as Metas">
      <HeaderSkeleton subtitle />
      <div
        aria-hidden="true"
        className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-4"
      >
        <CardSkeleton className="h-[280px] lg:h-[362px]" />
        <CardSkeleton className="h-[280px] lg:h-[362px]" />
      </div>
      <RowsSkeleton count={3} rowClassName="h-24" />
    </ScreenSkeleton>
  );
}
