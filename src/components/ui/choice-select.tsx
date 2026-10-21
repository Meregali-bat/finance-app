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
}: {
  value: string | null;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** O nome acessível do menu. */
  label: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
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
        className={cn("min-w-36 justify-between", className)}
      >
        <SelectValue placeholder={placeholder}>
          {(current: string | null) =>
            options.find((o) => o.value === current)?.label ?? placeholder ?? ""
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
