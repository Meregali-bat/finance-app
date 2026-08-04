"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function digitsToDisplay(digits: string): string {
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const cents = padded.slice(-2);
  const intPart = padded.slice(0, -2).replace(/^0+(?=\d)/, "");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped},${cents}`;
}

function digitsToNumericString(digits: string): string {
  if (!digits) return "";
  return (parseInt(digits, 10) / 100).toString();
}

export function CurrencyInput({
  name,
  id,
  defaultValue,
  required,
  className,
}: {
  name: string;
  id?: string;
  defaultValue?: number;
  required?: boolean;
  className?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [digits, setDigits] = useState(() =>
    defaultValue != null && defaultValue > 0 ? Math.round(defaultValue * 100).toString() : "",
  );

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
        R$
      </span>
      <Input
        id={inputId}
        type="text"
        inputMode="decimal"
        placeholder="0,00"
        value={digitsToDisplay(digits)}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
          setDigits(raw.slice(0, 15));
        }}
        required={required}
        className={cn("pl-9 tabular-nums", className)}
      />
      <input type="hidden" name={name} value={digitsToNumericString(digits)} />
    </div>
  );
}
