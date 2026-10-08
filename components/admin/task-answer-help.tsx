// R56: jak psát správné odpovědi. Dřív byla tahle nápověda vložená do formuláře
// KAŽDÉHO úkolu, takže se u zastavení s pěti úkoly opakovala pětkrát. Teď je
// jednou nahoře u úkolů, sbalená.
export function TaskAnswerHelp() {
  return (
    <details className="rounded-2xl border border-sky/20 bg-sky/10 px-4 py-3 text-sm text-white/90">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.2em] text-sky">
        Jak psát správné odpovědi
      </summary>
        <div className="mt-3 space-y-3 leading-6">
          <div>
            <p className="font-semibold text-white">Otevřená odpověď</p>
            <p className="text-mist">
              Když je správná jen jedna odpověď, napište ji normálně do pole. Když má mít víc správných variant,
              oddělte je nejlépe po řádcích, čárkou nebo středníkem.
            </p>
            <p className="mt-1 text-mist">
              Příklad: <span className="font-mono text-white">4, ctyri, čtyři</span>
            </p>
          </div>

          <div>
            <p className="font-semibold text-white">Úkol typu „napiš aspoň 3...“</p>
            <p className="text-mist">
              Do pole správné odpovědi napište whitelist povolených odpovědí. Hra pak uzná splnění, když hráč trefí
              alespoň požadovaný počet správných položek ze zadání.
            </p>
            <p className="mt-1 text-mist">
              Příklad: <span className="font-mono text-white">Rakousko; Polsko; Japonsko; Tunisko</span>
            </p>
            <p className="mt-1 text-mist">
              Nejbezpečnější formát je jedna povolená odpověď na řádek, případně čárka nebo středník. Tím se vyhnete
              tomu, že se více slov uloží jako jeden kus textu.
            </p>
          </div>

          <div>
            <p className="font-semibold text-white">Výběr z možností</p>
            <p className="text-mist">
              Do „Možnosti pro výběr“ napište jednu možnost na řádek. Do „Správná odpověď“ napište buď přesný text
              správné možnosti, nebo její pořadí <span className="font-mono text-white">1 / 2 / 3</span>.
              Nepřidávejte před ni <span className="font-mono text-white">Ano</span> ani{" "}
              <span className="font-mono text-white">Ne</span>; server uloží jen čistou vybranou možnost.
            </p>
            <p className="mt-2 text-mist">
              Může být správně víc možností – každou napište na samostatný řádek. Hráč vybírá jednu a body dostane za
              kteroukoli správnou. Příklad: možnosti{" "}
              <span className="font-mono text-white">Ano / Ne / Možná v jiném vesmíru</span>, správná odpověď všechny
              tři, každá na svém řádku.
            </p>
          </div>

          <div>
            <p className="font-semibold text-white">Seřaď podle pořadí</p>
            <p className="text-mist">
              Do „Možnosti pro výběr“ napište položky tak, jak je hráč uvidí na začátku – jednu na řádek.
              Do „Správná odpověď“ napište tytéž položky ve správném pořadí, taky jednu na řádek. Musí
              tam být všechny a každá právě jednou.
            </p>
            <p className="mt-1 text-mist">
              Příklad: možnosti <span className="font-mono text-white">Tělocvična / Tančírna / Zámeček</span>,
              správná odpověď <span className="font-mono text-white">Zámeček / Tančírna / Tělocvična</span>.
            </p>
            <p className="mt-1 text-mist">
              Hráč položky posouvá šipkami. Body dostane, jen když sedí celé pořadí.
            </p>
          </div>
          <div>
            <p className="font-semibold text-white">Ano / ne</p>
            <p className="text-mist">
              Do správné odpovědi napište přesně <span className="font-mono text-white">Ano</span> nebo{" "}
              <span className="font-mono text-white">Ne</span>. Možnosti se doplní automaticky.
            </p>
          </div>
        </div>
    </details>
  );
}
