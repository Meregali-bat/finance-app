import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // O iOS desenha `input[type=date]` com aparência nativa: o campo assume
        // altura e largura próprias e ignora as nossas, ficando maior que o
        // campo ao lado. `appearance-none` devolve o controle ao CSS, e a data
        // volta a alinhar à esquerda em vez de centralizada.
        "[&[type=date]]:appearance-none [&[type=date]::-webkit-date-and-time-value]:text-left",
        "h-11 w-full min-w-0 rounded-xl border border-input bg-transparent px-3.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
