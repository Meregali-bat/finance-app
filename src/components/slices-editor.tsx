"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { homeCard } from "@/components/home-card";
import { SectionLabel } from "@/components/page-header";
import { SliceDonut } from "@/components/slice-donut";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { disableSlices, saveSlices } from "@/lib/actions/slices";
import { errorMessage } from "@/lib/error-message";
import {
  DEFAULT_SLICES,
  SLICES,
  savingPercent,
  sumPercents,
  type SliceKey,
  type SlicePercents,
} from "@/lib/slices";
import { cn } from "@/lib/utils";

type SavingKey = "goals" | "freedom";

/**
 * Ajustar as fatias: a porcentagem de cada uma (controle deslizante ou
 * digitando), a fatia de cada categoria e de cada caixinha. Só salva somando
 * 100%.
 */
export function SlicesEditor({
  active,
  initialPercents,
  categories: initialCategories,
  jars: initialJars,
}: {
  active: boolean;
  initialPercents: SlicePercents;
  categories: { id: string; name: string; slice: SliceKey }[];
  jars: { id: string; name: string; slice: SavingKey }[];
}) {
  const router = useRouter();
  const [percents, setPercents] = useState(initialPercents);
  const [categories, setCategories] = useState(initialCategories);
  const [jars, setJars] = useState(initialJars);
  const [error, setError] = useState<string | null>(null);
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [pending, startTransition] = useTransition();
  const total = sumPercents(percents);
  const balanced = total === 100;

  function setPercent(key: SliceKey, value: number) {
    const clean = Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
    setPercents((current) => ({ ...current, [key]: clean }));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await saveSlices({
          percents,
          categories: categories.map((c) => ({ id: c.id, slice: c.slice })),
          jars: jars.map((j) => ({ id: j.id, slice: j.slice })),
        });
        router.push("/metas");
      } catch (e) {
        setError(errorMessage(e, "Não deu para salvar as fatias."));
      }
    });
  }

  function turnOff() {
    setError(null);
    startTransition(async () => {
      try {
        await disableSlices();
        router.push("/metas");
      } catch (e) {
        setError(errorMessage(e, "Não deu para desligar."));
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className={homeCard("flex flex-col items-center gap-5")}>
          <SliceDonut
            size={196}
            label={SLICES.map((s) => `${s.name} ${percents[s.key]}%`).join(", ")}
            segments={SLICES.map((s) => ({ key: s.key, value: percents[s.key], color: s.color }))}
          >
            <span
              className={cn(
                "font-heading text-3xl font-bold tabular-nums",
                !balanced && "text-negative",
              )}
            >
              {total}%
            </span>
            <span className="text-xs text-muted-foreground">
              {balanced
                ? "da renda"
                : total < 100
                  ? `faltam ${100 - total}%`
                  : `sobram ${total - 100}%`}
            </span>
          </SliceDonut>
          <p className="text-center text-[13px] text-muted-foreground">
            <b className="text-foreground">{savingPercent(percents)}%</b> para guardar (Metas e
            Liberdade financeira): o que faltar guardar no período sai do seu número do dia.
          </p>
          <button
            type="button"
            onClick={() => setPercents(DEFAULT_SLICES)}
            className="-my-3 py-3 text-[13px] font-medium text-primary underline-offset-4 hover:underline"
          >
            Voltar ao padrão ({SLICES.map((s) => DEFAULT_SLICES[s.key]).join(" · ")})
          </button>
        </div>

        <div className={homeCard("flex flex-col gap-5")}>
          {SLICES.map((slice) => (
            <div key={slice.key} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`slice-${slice.key}`} className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2 text-[15px] font-semibold">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: slice.color }}
                    />
                    {slice.name}
                    {slice.saving && (
                      <span className="rounded-full bg-positive/12 px-1.5 py-0.5 text-[10.5px] font-semibold text-positive">
                        guardar
                      </span>
                    )}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{slice.hint}</span>
                </label>
                <div className="flex shrink-0 items-center gap-1">
                  <input
                    id={`slice-${slice.key}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    value={percents[slice.key]}
                    onChange={(e) => setPercent(slice.key, Number(e.target.value))}
                    className="h-9 w-16 rounded-lg bg-(--field) px-2 text-right text-base font-semibold tabular-nums ring-1 ring-(--hairline) outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={percents[slice.key]}
                aria-label={`${slice.name}, porcentagem`}
                onChange={(e) => setPercent(slice.key, Number(e.target.value))}
                className="slice-range w-full"
                style={
                  {
                    "--slice-color": slice.color,
                    "--slice-fill": `${percents[slice.key]}%`,
                  } as React.CSSProperties
                }
              />
            </div>
          ))}
        </div>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Em que fatia cada categoria entra</SectionLabel>
          <div
            className={homeCard("grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-3 sm:grid-cols-2")}
          >
            {categories.map((category) => (
              <div key={category.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{category.name}</span>
                <ChoiceSelect
                  label={`Fatia de ${category.name}`}
                  className="w-40 shrink-0"
                  value={category.slice}
                  onChange={(value) =>
                    setCategories((current) =>
                      current.map((c) =>
                        c.id === category.id ? { ...c, slice: value as SliceKey } : c,
                      ),
                    )
                  }
                  options={SLICES.filter((s) => !s.saving).map((s) => ({
                    value: s.key,
                    label: s.name,
                  }))}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {jars.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Para que serve cada caixinha</SectionLabel>
          <div
            className={homeCard("grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-3 sm:grid-cols-2")}
          >
            {jars.map((jar) => (
              <div key={jar.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{jar.name}</span>
                <ChoiceSelect
                  label={`Fatia da caixinha ${jar.name}`}
                  className="w-48 shrink-0"
                  value={jar.slice}
                  onChange={(value) =>
                    setJars((current) =>
                      current.map((j) =>
                        j.id === jar.id ? { ...j, slice: value as SavingKey } : j,
                      ),
                    )
                  }
                  options={[
                    { value: "freedom", label: "Liberdade financeira" },
                    { value: "goals", label: "Metas" },
                  ]}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {active && confirmingOff ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
            <span className="text-muted-foreground">
              O número do dia volta a usar todo o dinheiro livre.
            </span>
            <button
              type="button"
              onClick={turnOff}
              disabled={pending}
              className="-my-3 py-3 font-semibold text-negative underline-offset-4 hover:underline disabled:opacity-50"
            >
              Desligar
            </button>
            <button
              type="button"
              onClick={() => setConfirmingOff(false)}
              disabled={pending}
              className="-my-3 py-3 font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              Manter
            </button>
          </div>
        ) : active ? (
          <button
            type="button"
            onClick={() => setConfirmingOff(true)}
            disabled={pending}
            className="-my-3 self-start py-3 text-[13px] font-medium text-negative underline-offset-4 hover:underline disabled:opacity-50"
          >
            Desligar as fatias
          </button>
        ) : (
          <span />
        )}
        <Button type="button" size="lg" onClick={save} disabled={pending || !balanced}>
          {pending
            ? "Salvando..."
            : balanced
              ? active
                ? "Salvar"
                : "Ativar as fatias"
              : `A soma precisa dar 100% (está em ${total}%)`}
        </Button>
      </div>
    </div>
  );
}
