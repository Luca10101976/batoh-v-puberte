import Image from "next/image";
import { illustrationSrc } from "@/lib/illustrations";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <section className="glass-card w-full p-6">
        <div className="flex justify-center">
          <Image
            src={illustrationSrc("sos")}
            alt=""
            width={132}
            height={132}
            className="object-contain"
            style={{ width: 132, height: 132 }}
          />
        </div>
        <p className="mt-3 text-xs uppercase tracking-[0.24em] text-coral">Offline režim</p>
        <h1 className="mt-3 text-2xl font-bold">Teď jsi bez internetu</h1>
        <p className="mt-3 text-sm leading-6 text-mist">
          Hrát se v Traki dá jen s připojením. Až se signál vrátí, hra se normálně načte a naváže tam, kde jsi
          skončil.
        </p>
        <p className="mt-3 text-sm leading-6 text-mist">
          Chystáš se někam, kde signál nebývá? Stáhni si příště u hry tiskovou verzi, vezmi ji s sebou a odpovědi
          přepiš do aplikace, až budeš zpátky online.
        </p>
      </section>
    </main>
  );
}
