/**
 * Enquanto o cartão carrega: a forma da tela (título, os dois números e as
 * faturas), para o toque na lista ter resposta na hora.
 */
export default function CardLoading() {
  const block = "animate-pulse rounded-[20px] bg-muted";
  return (
    <div className="flex flex-col gap-5 lg:gap-6" aria-busy="true" aria-label="Carregando o cartão">
      <div className="h-9 w-48 animate-pulse rounded-xl bg-muted" />
      <div className="grid grid-cols-2 gap-2.5 lg:gap-4">
        <div className={`${block} h-[104px]`} />
        <div className={`${block} h-[104px]`} />
      </div>
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${block} h-16`} />
        ))}
      </div>
    </div>
  );
}
