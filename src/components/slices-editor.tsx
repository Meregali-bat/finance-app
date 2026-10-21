"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { homeCard } from "@/components/home-card";
import { SectionLabel } from "@/components/page-header";
import { SliceDonut } from "@/components/slice-donut";
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
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
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
            className="text-[13px] font-medium text-primary underline-offset-4 hover:underline"
          >
            Voltar ao padrão (30 · 15 · 15 · 10 · 5 · 25)
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
                    className="h-9 w-16 rounded-lg bg-(--field) px-2 text-right text-sm font-semibold tabular-nums ring-1 ring-(--hairline) outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <div className={homeCard("grid gap-x-6 gap-y-3 sm:grid-cols-2")}>
            {categories.map((category) => (
              <label key={category.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium">{category.name}</span>
                <select
                  value={category.slice}
                  onChange={(e) =>
                    setCategories((current) =>
                      current.map((c) =>
                        c.id === category.id ? { ...c, slice: e.target.value as SliceKey } : c,
                      ),
                    )
                  }
                  className="h-9 rounded-full bg-(--field) px-3 text-[13px] font-medium ring-1 ring-(--hairline)"
                >
                  {SLICES.filter((s) => !s.saving).map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      {jars.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Para que serve cada caixinha</SectionLabel>
          <div className={homeCard("grid gap-x-6 gap-y-3 sm:grid-cols-2")}>
            {jars.map((jar) => (
              <label key={jar.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium">{jar.name}</span>
                <select
                  value={jar.slice}
                  onChange={(e) =>
                    setJars((current) =>
                      current.map((j) =>
                        j.id === jar.id ? { ...j, slice: e.target.value as SavingKey } : j,
                      ),
                    )
                  }
                  className="h-9 rounded-full bg-(--field) px-3 text-[13px] font-medium ring-1 ring-(--hairline)"
                >
                  <option value="freedom">Liberdade financeira</option>
                  <option value="goals">Metas</option>
                </select>
              </label>
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
        {active ? (
          <button
            type="button"
            onClick={turnOff}
            disabled={pending}
            className="self-start text-[13px] font-medium text-negative underline-offset-4 hover:underline disabled:opacity-50"
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
