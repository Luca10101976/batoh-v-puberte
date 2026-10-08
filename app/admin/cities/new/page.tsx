import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { createCityAction } from "@/app/admin/cities/actions";
import { CityForm } from "@/components/admin/city-form";

export const dynamic = "force-dynamic";

export default function NewCityPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 pb-10">
      <section className="glass-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Breadcrumbs items={[{ label: "Města", href: "/mozek/cities" }, { label: "Nové město" }]} />
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Nové město</h1>
          </div>
        </div>
      </section>

      <CityForm action={createCityAction} submitLabel="Vytvořit město" />
    </main>
  );
}
