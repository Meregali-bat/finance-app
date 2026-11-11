import {
  CardSkeleton,
  HeaderSkeleton,
  ScreenSkeleton,
} from "@/components/screen-skeleton";

/** Cabeçalho com o botão de novo cartão, a grade de cartões e o "adicionar". */
export default function CartoesLoading() {
  return (
    <ScreenSkeleton label="Carregando os Cartões">
      <HeaderSkeleton action />
      <div aria-hidden="true" className="grid gap-3 xl:grid-cols-2">
        {[0, 1, 2].map((i) => (
          <CardSkeleton key={i} className="h-[188px] rounded-[22px]" />
        ))}
      </div>
      <CardSkeleton className="h-[150px] lg:h-[92px]" />
    </ScreenSkeleton>
  );
}
