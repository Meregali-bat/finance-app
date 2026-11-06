import { describe, expect, it } from "vitest";
import {
  AI_CONSENT_VERSION,
  LEGAL_VERSION,
  hasCurrentConsent,
  isPublicPath,
  latestConsent,
  type ConsentRecord,
} from "@/lib/legal";
import { authConfig } from "@/auth.config";

const at = (iso: string) => new Date(iso);
const rec = (kind: string, version: string, createdAt: string, revokedAt: string | null = null): ConsentRecord => ({
  kind,
  version,
  createdAt: at(createdAt),
  revokedAt: revokedAt ? at(revokedAt) : null,
});

describe("aceites", () => {
  it("sem registro, não aceitou", () => {
    expect(hasCurrentConsent([], "terms")).toBe(false);
    expect(hasCurrentConsent([], "ai")).toBe(false);
  });

  it("aceite da versão atual vale", () => {
    expect(hasCurrentConsent([rec("terms", LEGAL_VERSION, "2026-11-06T10:00:00Z")], "terms")).toBe(true);
  });

  it("versão antiga não vale: o texto mudou, pede de novo", () => {
    expect(hasCurrentConsent([rec("terms", "2020-01-01", "2026-11-06T10:00:00Z")], "terms")).toBe(false);
  });

  it("um tipo não vale pelo outro", () => {
    expect(hasCurrentConsent([rec("terms", AI_CONSENT_VERSION, "2026-11-06T10:00:00Z")], "ai")).toBe(false);
  });

  it("revogado não vale, e aceitar de novo volta a valer", () => {
    const revoked = rec("ai", AI_CONSENT_VERSION, "2026-11-06T10:00:00Z", "2026-11-06T11:00:00Z");
    expect(hasCurrentConsent([revoked], "ai")).toBe(false);
    const again = rec("ai", AI_CONSENT_VERSION, "2026-11-06T12:00:00Z");
    expect(hasCurrentConsent([revoked, again], "ai")).toBe(true);
    expect(latestConsent([again, revoked], "ai")).toBe(again);
  });

  it("vale o mais recente, em qualquer ordem", () => {
    const old = rec("ai", AI_CONSENT_VERSION, "2026-11-01T10:00:00Z");
    const revokedLater = rec("ai", AI_CONSENT_VERSION, "2026-11-05T10:00:00Z", "2026-11-05T11:00:00Z");
    expect(hasCurrentConsent([old, revokedLater], "ai")).toBe(false);
  });
});

describe("rotas públicas", () => {
  it("termos e política abrem sem conta; o resto não", () => {
    expect(isPublicPath("/privacidade")).toBe(true);
    expect(isPublicPath("/termos")).toBe(true);
    expect(isPublicPath("/privacidade-falsa")).toBe(false);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/perfil")).toBe(false);
  });

  const authorized = (path: string, loggedIn: boolean) =>
    authConfig.callbacks.authorized({
      auth: loggedIn ? ({ user: { id: "u1" } } as never) : null,
      request: { nextUrl: new URL(`https://leeway.test${path}`) } as never,
    });

  it("o middleware deixa abrir /privacidade e /termos sem login", () => {
    expect(authorized("/privacidade", false)).toBe(true);
    expect(authorized("/termos", false)).toBe(true);
    expect(authorized("/perfil", false)).toBe(false);
  });

  it("logado também abre, sem ser mandado para o início", () => {
    expect(authorized("/termos", true)).toBe(true);
  });
});
