"use client";

import { useEffect, useState } from "react";

/**
 * R45: rozepsaná změna se nesmí ztratit potichu.
 *
 * Mozek ukládá výhradně na kliknutí – autosave nemáme a nechceme. Dokud ale
 * nebylo vidět, že formulář má neuložené změny, stačilo kliknout na „Zpět na
 * misi" a text byl pryč bez jediného varování.
 *
 * @param savedSignal zpráva o úspěšném uložení; jakmile dorazí, formulář je čistý
 * @param errorSignal zpráva o neúspěchu; uložení neproběhlo, takže změny trvají
 */
export function useUnsavedChanges(savedSignal?: string | null, errorSignal?: string | null) {
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (savedSignal) {
      setDirty(false);
    }
  }, [savedSignal]);

  // Neúspěšné uložení vrací příznak zpátky – data pořád nejsou v databázi.
  useEffect(() => {
    if (errorSignal) {
      setDirty(true);
    }
  }, [errorSignal]);

  // Zavření karty, obnovení stránky, krok zpět v prohlížeči.
  useEffect(() => {
    if (!dirty) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  // Odkazy uvnitř Mozku (Zpět na misi, Upravit, Náhled…). Server Actions jdou
  // přes tlačítka, ne přes odkazy, takže odeslání formuláře tímhle neprojde.
  useEffect(() => {
    if (!dirty) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const link = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) {
        return;
      }
      const leave = window.confirm("Máš neuložené změny. Opravdu chceš odejít a přijít o ně?");
      if (!leave) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [dirty]);

  return {
    dirty,
    /** Rozprostřít na <form>. Odeslání příznak shodí, aby odchod na server nehlásil falešné varování. */
    formProps: {
      onInput: () => setDirty(true),
      onChange: () => setDirty(true),
      onSubmit: () => setDirty(false)
    }
  };
}

export function UnsavedChangesBadge({ dirty }: { dirty: boolean }) {
  if (!dirty) {
    return null;
  }
  return (
    <p className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
      Neuložené změny
    </p>
  );
}
