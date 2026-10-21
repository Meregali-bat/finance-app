"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Um menu de escolha pequeno, com o visual do app: o `<select>` nativo abre a
 * lista do sistema, que no Windows com o tema escuro sai cinza-claro com texto
 * branco. Recebe as opções como lista simples.
 */
export function ChoiceSelect({
  value,
  onChange,
  options,
  label,
  placeholder,
  disabled,
  className,
  display,
}: {
  value: string | null;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** O nome acessível do menu. */
  label: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** O que o campo mostra no lugar do rótulo da opção (uma versão curta, ou um "herdado" em cinza). */
  display?: React.ReactNode;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        aria-label={label}
        className={cn("min-w-0 justify-between", className)}
      >
        <SelectValue placeholder={placeholder}>
          {(current: string | null) =>
            display ?? options.find((o) => o.value === current)?.label ?? placeholder ?? ""
          }
        </SelectValue>
      </SelectTrigger>
      {/* Abaixo do campo, e não por cima dele alinhado à opção escolhida: numa
          tabela, o menu por cima esconde a linha e a última opção ficava sob a
          seta de rolagem. */}
      <SelectContent alignItemWithTrigger={false} align="start">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
