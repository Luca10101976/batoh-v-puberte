import Link from "next/link";

// R53: drobečková cesta „Hry › Klamovka › Cassel“. Poslední položka je ta, kde
// jsi; ostatní jsou odkazy. Nahrazuje dřívější štítek „Mozek • Zastavení“, který
// říkal typ stránky, ale ne cestu k ní.

export type Breadcrumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  return (
    <nav aria-label="Kde jsi" className="text-xs uppercase tracking-[0.18em] text-sky">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => {
          const posledni = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {index > 0 ? <span aria-hidden="true" className="text-white/30">›</span> : null}
              {item.href && !posledni ? (
                <Link href={item.href} className="hover:text-white">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={posledni ? "page" : undefined} className={posledni ? "text-mist" : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
