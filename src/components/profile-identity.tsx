"use client";

import { useRef, useState, useTransition } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/user-avatar";
import { saveAvatar, saveName } from "@/lib/actions/profile";

/** O lado da foto salva: nítida no maior avatar do app (96px) em tela 2x. */
const AVATAR_PX = 256;

/**
 * Recorta o meio da imagem em quadrado e reduz para 256px em JPEG. Fica no
 * navegador: a foto do celular, de alguns MB, vira umas dezenas de KB antes
 * de sair do aparelho.
 */
async function toAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_PX;
  canvas.height = AVATAR_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_PX,
    AVATAR_PX,
  );
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function ProfileIdentity({
  initialName,
  email,
  initialAvatar,
}: {
  initialName: string | null;
  email: string;
  initialAvatar: string | null;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [avatar, setAvatar] = useState(initialAvatar);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [savingPhoto, startPhoto] = useTransition();

  const [savedName, setSavedName] = useState(initialName ?? "");
  const [name, setName] = useState(initialName ?? "");
  const [nameStatus, setNameStatus] = useState<"idle" | "saved" | "error">("idle");
  const [savingName, startName] = useTransition();
  const dirty = name.trim() !== savedName.trim();

  function pickPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoError(null);
    startPhoto(async () => {
      const previous = avatar;
      try {
        const dataUrl = await toAvatarDataUrl(file);
        setAvatar(dataUrl);
        await saveAvatar(dataUrl);
      } catch {
        setAvatar(previous);
        setPhotoError("Não deu para usar essa imagem. Tente uma foto em JPG ou PNG.");
      }
    });
  }

  function removePhoto() {
    const previous = avatar;
    setAvatar(null);
    setPhotoError(null);
    startPhoto(async () => {
      try {
        await saveAvatar(null);
      } catch {
        setAvatar(previous);
        setPhotoError("Não deu para tirar a foto agora. Tente de novo.");
      }
    });
  }

  function submitName(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    startName(async () => {
      try {
        await saveName(name);
        setSavedName(name.trim());
        setName(name.trim());
        setNameStatus("saved");
      } catch {
        setNameStatus("error");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={savingPhoto}
          aria-label={avatar ? "Trocar foto" : "Adicionar foto"}
          className="group relative shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] transition-transform duration-150 ease-out-quint"
        >
          <UserAvatar
            name={savedName || null}
            email={email}
            src={avatar}
            className={`size-[88px] transition-opacity lg:size-24 ${savingPhoto ? "opacity-60" : ""}`}
          />
          <span className="absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-[0_0_0_3px_var(--card),inset_0_1px_0_rgb(255_255_255/0.15)] transition-transform duration-150 group-hover:scale-105">
            <Camera className="size-4" aria-hidden="true" />
          </span>
        </button>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="min-w-0">
            <p className="truncate font-heading text-[20px] leading-tight font-bold tracking-[-0.025em]">
              {savedName || "Sem nome ainda"}
            </p>
            <p className="truncate text-[13px] text-muted-foreground">{email}</p>
          </div>
          <div className="-ml-2.5 flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={savingPhoto}
              onClick={() => fileInput.current?.click()}
            >
              {avatar ? "Trocar foto" : "Adicionar foto"}
            </Button>
            {avatar && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={savingPhoto}
                onClick={removePhoto}
                className="text-muted-foreground"
              >
                Tirar
              </Button>
            )}
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            pickPhoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {photoError && (
        <p role="alert" className="-mt-3 text-[13px] text-negative">
          {photoError}
        </p>
      )}

      <form onSubmit={submitName} className="flex flex-col gap-2">
        <Label htmlFor="profile-name">Seu nome</Label>
        <div className="flex gap-2">
          <Input
            id="profile-name"
            value={name}
            maxLength={60}
            autoComplete="name"
            placeholder="Como você quer ser chamado"
            onChange={(e) => {
              setName(e.target.value);
              setNameStatus("idle");
            }}
          />
          <Button type="submit" size="lg" disabled={!dirty || savingName} className="shrink-0">
            {savingName ? "Salvando…" : "Salvar"}
          </Button>
        </div>
        <p aria-live="polite" className="min-h-[18px] text-[12.5px] text-muted-foreground">
          {nameStatus === "saved" && "Nome salvo."}
          {nameStatus === "error" && (
            <span className="text-negative">Não deu para salvar. Confira a conexão e tente de novo.</span>
          )}
        </p>
      </form>
    </div>
  );
}
