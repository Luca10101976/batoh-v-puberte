import Link from "next/link";
import { createCityAction } from "@/app/admin/cities/actions";
import { CityForm } from "@/components/admin/city-form";

export const dynamic = "force-dynamic";

export default function NewCityPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 pb-10">
      <section className="glass-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sky">Mozek • Města</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Nové město</h1>
          </div>
          <Link href="/mozek/cities" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
            Zpět
          </Link>
        </div>
      </section>

      <CityForm action={createCityAction} submitLabel="Vytvořit město" />
    </main>
  );
}
