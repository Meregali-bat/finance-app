import { cn } from "@/lib/utils";

/** As iniciais do nome (duas no máximo); sem nome, a primeira letra do email. */
export function initialsOf(name: string | null, email: string) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return email.charAt(0).toUpperCase();
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

/**
 * A foto do perfil num círculo; sem foto, as iniciais na cor de destaque
 * sobre o tom secundário da paleta. O tamanho vem de `className` (size-*), e
 * a letra acompanha pelo `container`.
 */
export function UserAvatar({
  name,
  email,
  src,
  className,
}: {
  name: string | null;
  email: string;
  src: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "@container relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-primary shadow-[inset_0_0_0_1px_var(--hairline)]",
        className,
      )}
    >
      {src ? (
        // Data URL pequena, já no tamanho certo: o next/image não teria o que otimizar.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden="true" className="font-heading text-[40cqw] leading-none font-bold tracking-[-0.03em]">
          {initialsOf(name, email)}
        </span>
      )}
    </span>
  );
}
