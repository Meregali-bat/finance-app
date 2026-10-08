/**
 * `prisma migrate deploy` para o build da Vercel, que falha cedo em vez de
 * travar.
 *
 * Pelo transaction pooler do Supabase (porta 6543, pgbouncer) a migração não
 * consegue o advisory lock e espera para sempre — o build só morre no limite
 * de 45 minutos da Vercel, sem dizer por quê. Aqui:
 *
 * - uma conexão na porta 6543 é recusada na hora, com o que fazer;
 * - qualquer outra trava é cortada depois de MIGRATE_TIMEOUT_MS.
 *
 * A URL é a mesma que prisma.config.ts escolhe: DIRECT_URL, senão DATABASE_URL.
 * Se a migração falha, o build falha e o deploy anterior continua no ar.
 */
import { spawn } from "node:child_process";

const TIMEOUT_MS = Number(process.env.MIGRATE_TIMEOUT_MS ?? 5 * 60 * 1000);
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!url) {
  console.error("✖ Nem DIRECT_URL nem DATABASE_URL estão definidas: não há banco para migrar.");
  process.exit(1);
}

let port;
try {
  port = new URL(url).port;
} catch {
  port = "";
}

if (port === "6543") {
  console.error(
    [
      "✖ A migração ia rodar pelo transaction pooler do Supabase (porta 6543), onde ela trava.",
      "  Defina DIRECT_URL na Vercel (Settings → Environment Variables, para Production e Preview)",
      "  com a mesma conexão do DATABASE_URL, trocando a porta 6543 por 5432 e tirando",
      "  `?pgbouncer=true`. O app continua usando o DATABASE_URL; só a migração usa a DIRECT_URL.",
    ].join("\n"),
  );
  process.exit(1);
}

const child = spawn("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit" });
const timer = setTimeout(() => {
  console.error(
    `✖ A migração passou de ${Math.round(TIMEOUT_MS / 1000)}s e foi interrompida. ` +
      "Confira se a DIRECT_URL aponta para a conexão direta ou de sessão (porta 5432).",
  );
  child.kill("SIGTERM");
  process.exit(1);
}, TIMEOUT_MS);

child.on("exit", (code) => {
  clearTimeout(timer);
  process.exit(code ?? 1);
});
