import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  AVATAR_COUNT,
  AVATAR_IDS,
  DEFAULT_AVATAR_ID,
  avatarSrc,
  isAvatarId,
  isLegacyAvatarId,
  isStorableAvatarValue,
  resolveAvatarId
} from "./avatars.ts";

test("sada má 24 samolepek a výchozí je první", () => {
  assert.equal(AVATAR_IDS.length, AVATAR_COUNT);
  assert.equal(DEFAULT_AVATAR_ID, "traki-01");
  assert.equal(AVATAR_IDS.at(-1), "traki-24");
  assert.equal(new Set(AVATAR_IDS).size, AVATAR_COUNT);
});

test("ke každému identifikátoru existuje soubor", () => {
  const dir = path.resolve(import.meta.dirname, "../public/avatars/traki");
  for (const id of AVATAR_IDS) {
    assert.ok(fs.existsSync(path.join(dir, `${id}.webp`)), `chybí ${id}.webp`);
  }
});

test("historické batuzek-NN se mapuje na odpovídající samolepku (bez DB migrace)", () => {
  assert.equal(resolveAvatarId("batuzek-01"), "traki-01");
  assert.equal(resolveAvatarId("batuzek-08"), "traki-08");
  assert.equal(resolveAvatarId("batuzek-10"), "traki-10");
  assert.equal(resolveAvatarId("batuzek-14"), "traki-14");
  assert.equal(resolveAvatarId("batuzek-18"), "traki-18");
  assert.equal(resolveAvatarId("batuzek-20"), "traki-20");
});

test("neznámá, prázdná nebo mimo rozsah hodnota spadne na výchozí avatar", () => {
  for (const value of ["", null, undefined, "😀", "traki-99", "batuzek-99", "batuzek-1", "nesmysl"]) {
    assert.equal(resolveAvatarId(value as string), DEFAULT_AVATAR_ID, `${value}`);
  }
});

test("cesta k obrázku vede do nové sady", () => {
  assert.equal(avatarSrc("traki-07"), "/avatars/traki/traki-07.webp");
  assert.equal(avatarSrc("batuzek-07"), "/avatars/traki/traki-07.webp");
  assert.equal(avatarSrc("nesmysl"), "/avatars/traki/traki-01.webp");
});

test("rozpoznání typů hodnot pro validaci na serveru", () => {
  assert.equal(isAvatarId("traki-24"), true);
  assert.equal(isAvatarId("traki-25"), false);
  assert.equal(isLegacyAvatarId("batuzek-18"), true);
  assert.equal(isLegacyAvatarId("traki-18"), false);
  assert.equal(isStorableAvatarValue("traki-03"), true);
  assert.equal(isStorableAvatarValue("batuzek-03"), true);
  assert.equal(isStorableAvatarValue("😀"), false);
});
