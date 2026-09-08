# assets-archive

Vyřazené obrázky, které se v aplikaci už nepoužívají, ale zůstávají uložené pro případ potřeby.
Nejsou v `public/`, takže se neservírují a nezvětšují nasazený build.

- `avatars-batuzek/` – původní sada 20 avatarů (`batuzek-01..20.png`). Nahrazena sadou samolepek
  Traki v `public/avatars/traki/`. Historické hodnoty `batuzek-NN` uložené v databázi zůstávají
  platné, `lib/avatars.ts` je mapuje na odpovídající novou samolepku.
