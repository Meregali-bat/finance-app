import type { MetadataRoute } from "next";

/**
 * O que o celular usa ao "adicionar à tela de início": nome, ícone e abrir
 * em tela cheia, sem a barra do navegador. O iPhone pega o ícone do
 * apple-icon.png; o Android e os navegadores de desktop, destes aqui.
 *
 * O ícone é um quadrado cheio, sem cantos arredondados — cada sistema recorta
 * no formato dele —, e a marca ocupa menos da metade do quadrado, dentro da
 * área segura do "maskable".
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Leeway",
    short_name: "Leeway",
    description: "Quanto você pode gastar hoje até receber de novo.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c0706",
    theme_color: "#0c0706",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
