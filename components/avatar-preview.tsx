"use client";

import Image from "next/image";
import { avatarSrc } from "@/lib/avatars";

/**
 * Avatar hráče = jedna samolepka Traki (jediný avatarový systém, R18/R21).
 * R33: stejný avatar se ukazuje v profilu i v žebříčku, proto je komponenta sdílená.
 */
export function AvatarPreview({ size = 80, avatar }: { size?: number; avatar?: string | null }) {
  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-[30px] border border-white/10 bg-[#8dded8] shadow-[inset_0_1px_0_rgba(255,255,255,0.38)]"
      style={{ width: size, height: size }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 18%, rgba(235,255,251,0.9), rgba(97,204,198,0.38) 72%, rgba(38,117,126,0.18))"
        }}
      />
      <div className="relative h-[90%] w-[90%]">
        <Image src={avatarSrc(avatar ?? undefined)} alt="" fill sizes={`${size}px`} className="object-contain" />
      </div>
    </div>
  );
}
