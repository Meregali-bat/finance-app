import { CardSkeleton, HeaderSkeleton, ScreenSkeleton } from "@/components/screen-skeleton";

/** Cabeçalho com a seta de voltar e os três cards do Perfil, na coluna estreita dele. */
export default function PerfilLoading() {
  return (
    <ScreenSkeleton label="Carregando o Perfil" className="mx-auto w-full max-w-2xl">
      <HeaderSkeleton back />
      <CardSkeleton className="h-[241px] rounded-[22px] lg:h-[260px]" />
      <CardSkeleton className="h-[565px] rounded-[22px] lg:h-[415px]" />
      <CardSkeleton className="h-[311px] rounded-[22px] lg:h-[242px]" />
    </ScreenSkeleton>
  );
}
