import type { Metadata, Viewport } from "next";
import { currentAppearance } from "@/lib/theme-server";
import { paletteInfo } from "@/lib/theme";
import { Bricolage_Grotesque, Geist, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
// Depois do globals.css: as paletas redefinem os tokens de lá.
import "./palettes.css";

// Bricolage Grotesque para títulos e números, Geist para texto e interface —
// o par do handoff de 16/10, no lugar de Sora + Inter.
const heading = Bricolage_Grotesque({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const sans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { theme } = await currentAppearance();
  return {
    title: "Leeway",
    description: "Quanto você pode gastar hoje até receber de novo.",
    // Aberto da tela de início do iPhone: em tela cheia, com este nome.
    appleWebApp: {
      capable: true,
      title: "Leeway",
      // No escuro, a barra de status fica transparente sobre o fundo (o
      // conteúdo desce pelo safe-area); no claro, a barra branca padrão —
      // o relógio branco do "translucent" sumiria no fundo creme.
      statusBarStyle: theme === "dark" ? "black-translucent" : "default",
    },
  };
}

/** A cor da barra do navegador acompanha o tema escolhido. */
export async function generateViewport(): Promise<Viewport> {
  const { theme, palette } = await currentAppearance();
  const { dark, light } = paletteInfo(palette).background;
  return {
    width: "device-width",
    initialScale: 1,
    // Ocupa a tela toda no iPhone; o safe-area dá o espaço do relógio e da barra.
    viewportFit: "cover",
    themeColor:
      theme === "system"
        ? [
            { media: "(prefers-color-scheme: dark)", color: dark },
            { media: "(prefers-color-scheme: light)", color: light },
          ]
        : theme === "light"
          ? light
          : dark,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Lido no servidor: o HTML já sai com o tema certo, sem piscar.
  const { theme, palette } = await currentAppearance();
  return (
    <html
      lang="pt-BR"
      data-theme={theme}
      data-palette={palette}
      // O ThemeSwitcher troca o atributo direto no <html> antes do servidor
      // responder; sem isto o React reclamaria da diferença.
      suppressHydrationWarning
      className={`${heading.variable} ${sans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
