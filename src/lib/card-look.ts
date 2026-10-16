/**
 * O degradê de cada cartão, para eles se distinguirem de relance na lista e
 * no detalhe. Vem do id (não da posição): o cartão mantém a cor quando outro
 * é criado ou apagado.
 */
const GRADIENTS = [
  "linear-gradient(140deg,#5e0706 0%,#3a0c0b 60%,#290f0e 100%)",
  "linear-gradient(140deg,#4b2a12 0%,#2d1a10 60%,#1b1110 100%)",
  "linear-gradient(140deg,#2b2423 0%,#1f1817 60%,#1b1110 100%)",
  "linear-gradient(140deg,#6b0504 0%,#440b0a 60%,#290f0e 100%)",
];

export function cardGradient(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}
