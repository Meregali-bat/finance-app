-- Perfil: nome, foto e aparência (modo claro/escuro e paleta) salvos na conta.
ALTER TABLE "User" ADD COLUMN "name" TEXT;
ALTER TABLE "User" ADD COLUMN "avatar" TEXT;
ALTER TABLE "User" ADD COLUMN "theme" TEXT;
ALTER TABLE "User" ADD COLUMN "palette" TEXT;
