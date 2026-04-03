export type TaskType = "question" | "photo" | "choice";

export type Task = {
  id: string;
  type: TaskType;
  typeLabel: string;
  title: string;
  content: string;
  options?: string[];
  illustrationImage?: string;
  illustrationImageAlt?: string;
};

export type Episode = {
  id: string;
  name: string;
  intro: string;
  background: string;
  tasks: Task[];
  clue: string[];
};

export type MapLocation = {
  id: string;
  city: string;
  name: string;
  teaser: string;
  subtitle: string;
  story: string;
  image: string;
  unlocked: boolean;
  difficulty: "Lehká" | "Střední" | "Vyšší";
  distance: string;
  duration: string;
  areaHint: string;
  vibe: string[];
  lat: number;
  lng: number;
  map: {
    x: number;
    y: number;
  };
  introLabel: string;
  introStory: string;
  endingTitle: string;
  endingStory: string;
  playerMessage: string;
  interludes: string[];
  episodes: Episode[];
};

export const nearbyMissions = [
  {
    name: "Ztracený příběh Klamovky",
    locationId: "klamovka",
    city: "Praha",
    distance: "11 min",
    boost: "+120 bodů",
    status: "Blízko tebe"
  },
  {
    name: "Budějovický kód: Operace Žába",
    locationId: "budejovice-zaba",
    city: "České Budějovice",
    distance: "1-2 h v centru",
    boost: "+180 bodů",
    status: "Výletová mise"
  }
];

export const activityFeed = [
  { friend: "Ema", action: "dokončila Klamovku", ago: "před 18 min" },
  { friend: "Matěj", action: "založil výpravu Lovci stop", ago: "před 37 min" },
  { friend: "Sofi", action: "předběhla tě v žebříčku", ago: "před 1 h" }
];

export const locations: MapLocation[] = [
  {
    id: "klamovka",
    city: "Praha",
    name: "Park Klamovka",
    subtitle: "Posbírej ztracený příběh",
    teaser: "Park, kde najdeš hlavu koně i peklo :)",
    story:
      "V Klamovce se rozsypal příběh. Hodiny jdou špatně, Cassel má jen hlavu a na chrámku se jedna tvář usmívá, zatímco ostatní se mračí. Tvůj úkol je dát tyhle stopy zase dohromady.",
    image: "/images/klamovka-chramek.jpeg",
    unlocked: false,
    difficulty: "Střední",
    distance: "11 min od tebe",
    duration: "35-50 min",
    areaHint: "Drž se v místě hry.",
    vibe: ["Městská záhada", "Detaily, které unikají", "Ideální pro partu"],
    lat: 50.0717634,
    lng: 14.3762351,
    map: { x: 28, y: 58 },
    introLabel: "Úvodní mise",
    introStory:
      "Klamovka má divokou historii: od vinic Karla IV. přes klášter a šlechtu až po Sokol a underground. Dnes je to park, galerie a místo pro děti. Když budeš koukat pozorně, narazíš tu na koňskou hlavu i zadek.",
    endingTitle: "Klamovka zase vypráví",
    endingStory:
      "Neposkládala jsi jen jednu hádanku. Posbírala jsi kusy minulosti, které tu byly rozházené po celém parku. Klamovka není rozbitá, jen je složená z víc časů najednou.",
    playerMessage:
      "Skvělá práce. Klamovka není jen park. Je to místo, kde důležité věci často najdeš v malých detailech.",
    interludes: [
      "Tohle nevypadá jako náhoda. Spíš jako park, který si něco pamatuje.",
      "Když něco chybí, bývá to většinou důležité.",
      "Jestli ti to připadá divné, jsi správně.",
      "Klamovka ti všechno neřekne. Musíš si toho všimnout."
    ],
    episodes: [
      {
        id: "chramek",
        name: "Chrámek noci a poznání",
        intro: "Hvězdy i hadí hlavy. Nebe i peklo.",
        background:
          "Vznikl na konci 18. století za Clam-Gallasů. Horní část představuje nebe, dolní část podzemí. Díry v kopuli měly zevnitř vytvořit iluzi hvězdné oblohy.",
        tasks: [
          {
            id: "klamovka-chramek-1",
            type: "question",
            typeLabel: "Otázka",
            title: "Hadí hlavy",
            content: "Kolik hadích hlav najdeš pod střechou?"
          },
          {
            id: "klamovka-chramek-2",
            type: "question",
            typeLabel: "Otázka",
            title: "Hvězdy v nebi",
            content: "Kolik velkých hvězd je na chrámku?"
          },
          {
            id: "klamovka-chramek-3",
            type: "question",
            typeLabel: "Otázka",
            title: "Asi špatný den",
            content: "Hodně zamračených hlav. Jsou tam nějaké s úsměvem?"
          },
          {
            id: "klamovka-chramek-4",
            type: "choice",
            typeLabel: "Výběr",
            title: "Dvě poloviny",
            content: "Jak se jmenují dvě části chrámku?",
            options: ["Nebe a peklo", "Den a noc", "Sláva a pád"],
            illustrationImage: "/images/klamovka-nebe-peklo.png",
            illustrationImageAlt: "Chrámek Klamovka - nebe a peklo"
          },
          {
            id: "klamovka-chramek-5",
            type: "choice",
            typeLabel: "Výběr",
            title: "Kudy do pekla",
            content: "Jak se jde do spodní části chrámku?",
            options: ["Ze schodů", "Do kopce"]
          }
        ],
        clue: [
          "První kus příběhu je rozdělený na dvě části: nebe a peklo.",
          "Něco tu očividně není v rovnováze.",
          "A přesto se uprostřed všeho jedna tvář usmívá."
        ]
      },
      {
        id: "cassel",
        name: "Cassel",
        intro: "Někdo ztratí hlavu, někdo tělo.",
        background:
          "Cassel byl vojenský kůň generála Eduarda Clam-Gallase. Jenže je tu háček. Pomník nejspíš vznikl roku 1808, to byly Edovi teprve 3 roky. To už měl válečného koně? Je tedy možné, že vznikl až roku 1838, historici sami neví.",
        tasks: [
          {
            id: "klamovka-cassel-1",
            type: "question",
            typeLabel: "Otázka",
            title: "Splašily se a utekly",
            content: "Pomník má jen hlavu. Co chybí?"
          },
          {
            id: "klamovka-cassel-2",
            type: "question",
            typeLabel: "Otázka",
            title: "Kolik mu mohlo být",
            content: "Sečti oba Eduardovy možné věky a číslo zapiš."
          },
          {
            id: "klamovka-cassel-4",
            type: "choice",
            typeLabel: "Výběr",
            title: "Vědro",
            content: "Snad v tom vědru nemá žádlo, to by se moc nenajedl. Kde má vědro?",
            options: ["Na hlavě", "Na zadku co mu utekl"]
          },
          {
            id: "klamovka-cassel-5",
            type: "question",
            typeLabel: "Výzva",
            title: "Slovní hra",
            content: "Pod hlavou koně je nápis. Z písmen z toho nápisu vymysli aspoň 3 další slova."
          },
          {
            id: "klamovka-cassel-3",
            type: "question",
            typeLabel: "Otázka",
            title: "Hlídka sokolů",
            content:
              "Možná Casselovi tělo ukradli sokolové. Vydej se doprava od koně, najdi, kde hlídkují dva kamenní sokolové. Spočítej schody které k nim vedou."
          }
        ],
        clue: [
          "Druhý kus příběhu ukazuje, že i slavné věci někdy přežijí jen napůl.",
          "U Cassela chybí tělo, ale stopa zůstala.",
          "Minulost tu odpadává po kouscích."
        ]
      },
      {
        id: "altan",
        name: "Novogotický altán",
        intro: "Sklad na nářadí nebo galerie?",
        background:
          "Altán byl postaven kolem roku 1820 a sloužil jako zahradní, provozní budova. Třeba jako sklad",
        tasks: [
          {
            id: "klamovka-altan-2",
            type: "question",
            typeLabel: "Otázka",
            title: "Co je uvnitř",
            content: "Co je dnes uvnitř altánu?",
            illustrationImage: "/images/klamovka-altan.png",
            illustrationImageAlt: "Altánek v Klamovce"
          },
          {
            id: "klamovka-altan-3",
            type: "choice",
            typeLabel: "Výběr",
            title: "Která zvířata byla v parku",
            content: "Jaká zvířata se podle dobových záznamů chovala v parku Klamovka?",
            options: ["vlci a medvedi", "kolibříci", "rýžový špaček jménem Atbaliba"]
          }
        ],
        clue: [
          "Třetí kus příběhu se nerozsypal. Spíš se schoval.",
          "Altán připomíná, že v Klamovce umí věci mizet i bez kouzel.",
          "Park kdysi býval mnohem víc než jen park."
        ]
      },
      {
        id: "hodiny",
        name: "Přijdu včas",
        intro:
          "Přijít domů v 5? To může být náročný úkol                          Najdi věž na které jsou hodiny",
        background: "",
        tasks: [
          {
            id: "klamovka-hodiny-1",
            type: "question",
            typeLabel: "Otázka",
            title: "Papeži papeži, kolik je hodin na věži?",
            content: "Kolik ciferníků má věž"
          },
          {
            id: "klamovka-hodiny-2",
            type: "choice",
            typeLabel: "Výběr",
            title: "Znak",
            content: "Jaký znak je na hodinách?",
            options: ["Praha", "Praha 5"]
          },
          {
            id: "klamovka-hodiny-3",
            type: "choice",
            typeLabel: "Výběr",
            title: "Přijdu včas?",
            content: "Ukazují hodiny správný čas?",
            options: ["Ano", "Ne", "Možná v jiném vesmíru"]
          }
        ],
        clue: [
          "Čtvrtý kus příběhu je čas, který si dělá co chce.",
          "Minulost a současnost tu stojí vedle sebe.",
          "Čas je tu rozházený stejně jako zbytek parku."
        ]
      },
      {
        id: "rodina",
        name: "Socha Rodiny",
        intro: "Na posledním místě tě čeká sousoší rodiny",
        background:
          "Autorem sousoší je sochař Karel Velický. Je z pískovce a jsou na něm žena, muž a děti.",
        tasks: [
          {
            id: "klamovka-rodina-1",
            type: "question",
            typeLabel: "Otázka",
            title: "Kolik jich je",
            content: "Kolik členů rodiny na soše napočítáš?"
          },
          {
            id: "klamovka-rodina-2",
            type: "question",
            typeLabel: "Otázka",
            title: "Materiál",
            content: "Z jakého materiálu je socha?"
          },
          {
            id: "klamovka-rodina-3",
            type: "question",
            typeLabel: "Otázka",
            title: "Zadek",
            content: "A je to tu, vidíš zadek? Kdo ho má na rameni?"
          }
        ],
        clue: ["Pátý kus příběhu je konečně celý."]
      }
    ]
  },
  {
    id: "budejovice-zaba",
    city: "České Budějovice",
    name: "Budějovický kód: Operace Žába",
    subtitle: "Městská mise pro starší",
    teaser: "Pátrání po ztracené žábě přes věž, náměstí a Solnici.",
    story:
      "V Budějovicích se ztratila kamenná žába. Po městě zůstaly jen stopy, útržky legend a tři čísla kódu. Jestli je dáš dohromady, dovede tě to až k cíli.",
    image: "/images/klamovka-chramek.jpeg",
    unlocked: false,
    difficulty: "Vyšší",
    distance: "Centrum města",
    duration: "60-90 min",
    areaHint: "Drž se v historickém centru Českých Budějovic.",
    vibe: ["Městské pátrání", "Logika a kód", "Ideální na výlet"],
    lat: 48.9747,
    lng: 14.4749,
    map: { x: 62, y: 46 },
    introLabel: "Výpravná mise",
    introStory:
      "Tahle mise není jen na rychlou procházku kolem domu. Je to plnohodnotná městská bojovka, kterou můžeš hrát i při plánované dovolené.",
    endingTitle: "Kód je kompletní",
    endingStory:
      "Poskládal/a jsi tři čísla i všechny stopy. Žába nebyla ztracená navždy, jen čekala na někoho, kdo dokáže číst město jako mapu stop.",
    playerMessage:
      "Výborně. Tohle byla těžší mise a zvládl/a jsi ji jako profík. Budějovice sis neprošel/prošla, ale opravdu přečetl/a.",
    interludes: [
      "Staré město rádo mluví, ale jen v narážkách.",
      "Když nesedí legenda, hledej detail.",
      "Kód je vždycky ukrytý v tom, co většina přejde bez povšimnutí."
    ],
    episodes: [
      {
        id: "cerna-vez",
        name: "Černá věž: první číslo",
        intro:
          "Začínáš u Černé věže. Potřebuješ první číslo kódu a to nepřijde zadarmo: čeká tě kombinace pozorování a počítání.",
        background:
          "Černá věž vznikala v 16. století a měla strážní funkci. Je jedním z hlavních orientačních bodů centra.",
        tasks: [
          {
            id: "budejovice-vez-1",
            type: "question",
            typeLabel: "Otázka",
            title: "Rok na dveřích",
            content: "Najdi dveře do Černé věže. Jaký rok je na dveřích?"
          },
          {
            id: "budejovice-vez-2",
            type: "question",
            typeLabel: "Otázka",
            title: "Počet schodů",
            content: "Kolik schodů vede až nahoru?"
          },
          {
            id: "budejovice-vez-3",
            type: "question",
            typeLabel: "Kód",
            title: "První číslo",
            content: "Vyřaď opakující se číslice, nech jedinečné, sečti je a zapiš výsledek."
          }
        ],
        clue: ["Máš první číslo kódu.", "Věž dala číslo, ale žába pořád chybí."]
      },
      {
        id: "orloj",
        name: "Měsíční orloj",
        intro:
          "Pod ciferníkem věže najdeš měsíční kouli. Tady nejde o rychlost, ale o to, jestli si všimneš, co sedí a co ne.",
        background:
          "Koule pod ciferníkem ukazuje fázi Měsíce. Je to detail, který většina lidí mine, protože se dívá jen na hodiny.",
        tasks: [
          {
            id: "budejovice-orloj-1",
            type: "choice",
            typeLabel: "Výběr",
            title: "Jak vypadá měsíc",
            content: "Jaká fáze Měsíce je dnes nejblíž realitě?",
            options: ["Úplněk", "Půlměsíc", "Srpek", "Nevím"]
          },
          {
            id: "budejovice-orloj-2",
            type: "choice",
            typeLabel: "Výběr",
            title: "Sedí orloj?",
            content: "Odpovídá světlá část koule tomu, co vidíš na obloze?",
            options: ["Sedí", "Nesedí", "Nedá se ověřit"]
          }
        ],
        clue: ["Technika může klamat.", "Ne každá stopa je číslo, ale každá je důležitá."]
      },
      {
        id: "samson",
        name: "Samsonova kašna a bludný kámen",
        intro:
          "Na náměstí hledáš bludný kámen. Legenda říká, že kdo ho po deváté večer překročí, může bloudit.",
        background:
          "Bludný kámen je historická stopa a zároveň městská legenda, která přežila až do dneška.",
        tasks: [
          {
            id: "budejovice-samson-1",
            type: "question",
            typeLabel: "Otázka",
            title: "Devátá hodina",
            content: "Jak vypadá na ciferníku 9 hodin? Zapiš to jako čas."
          },
          {
            id: "budejovice-samson-2",
            type: "photo",
            typeLabel: "Výzva na místě",
            title: "Kámen s křížkem",
            content: "Najdi bludný kámen s křížkem a potvrď, že jsi na správném místě."
          }
        ],
        clue: ["Město ti dává směr.", "Teď se přesouváš k druhému číslu."]
      },
      {
        id: "loket",
        name: "Vídeňský loket",
        intro:
          "Na radnici hledej měřítko zvané vídeňský loket. Druhé číslo kódu je schované právě tady.",
        background:
          "Vídeňský loket byla historická míra. Sloužila jako veřejný etalon, aby se obchodníci nehádali o délku.",
        tasks: [
          {
            id: "budejovice-loket-1",
            type: "question",
            typeLabel: "Otázka",
            title: "Symbol na lokti",
            content: "Kterému číslu se nejvíc podobá symbol na lokti?"
          },
          {
            id: "budejovice-loket-2",
            type: "question",
            typeLabel: "Kód",
            title: "Druhé číslo",
            content: "Zapiš číslo, které bereš jako druhé číslo tajného kódu."
          }
        ],
        clue: ["Máš druhé číslo.", "Teď rozhodne Solnice."]
      },
      {
        id: "solnice",
        name: "Solnice: tři hlavy",
        intro:
          "Na Solnici najdeš tři hlavy lupičů a tři nápovědy. Jen jedna tě dovede správně.",
        background:
          "Hlavy na Solnici jsou spojené s legendou o loupeži u klášterního kostela. Dnes fungují jako memento i městská záhada.",
        tasks: [
          {
            id: "budejovice-solnice-1",
            type: "choice",
            typeLabel: "Výběr",
            title: "Která hlava mluví pravdu",
            content: "Která z hlav dala správnou stopu?",
            options: ["Hlava 1", "Hlava 2", "Hlava 3"]
          },
          {
            id: "budejovice-solnice-2",
            type: "question",
            typeLabel: "Kód",
            title: "Třetí číslo",
            content: "Zapiš číslo správné hlavy jako třetí číslo kódu."
          }
        ],
        clue: ["Třetí číslo máš.", "Teď už zbývá najít žábu."]
      },
      {
        id: "kostel-zaba",
        name: "Kostel a kamenná žába",
        intro:
          "Poslední místo: severní strana kostela Obětování Panny Marie. Tady má být žába, kterou celé město hledalo.",
        background:
          "Kamenný chrlič ve tvaru žáby je spojený s místní pověstí. Ať je legenda jakákoliv, stopa je reálná a vede sem.",
        tasks: [
          {
            id: "budejovice-final-1",
            type: "photo",
            typeLabel: "Výzva na místě",
            title: "Najdi žábu",
            content: "Najdi kamennou žábu na severní straně kostela a potvrď nález."
          },
          {
            id: "budejovice-final-2",
            type: "question",
            typeLabel: "Finále",
            title: "Kompletní kód",
            content: "Zadej tři čísla kódu za sebe."
          }
        ],
        clue: ["Kód byl správně.", "Mise je dokončená."]
      }
    ]
  }
];

export const leaderboard = [
  { name: "Ema", city: "Praha", score: 31, squad: "Noční parta", delta: "+2 dnes" },
  { name: "Matyáš", city: "Brno", score: 29, squad: "Mostaři", delta: "+1 dnes" },
  { name: "Týna", city: "Praha", score: 24, squad: "Výprava 4A", delta: "Tvoje pozice" },
  { name: "Sofi", city: "Olomouc", score: 21, squad: "Kamenné listy", delta: "+3 dnes" }
];

export const squads = [
  { name: "Noční parta", members: 5, score: 82, city: "Praha" },
  { name: "Mostaři", members: 4, score: 74, city: "Brno" },
  { name: "Výprava 4A", members: 6, score: 68, city: "Praha" }
];

export const profileProgress = [
  { label: "Lokace", value: "24" },
  { label: "Body", value: "920" },
  { label: "Top série", value: "8" }
];

export const friends = [
  { initials: "EM", name: "Ema", unlocked: 31, streak: "5 dní v řadě", status: "Teď venku" },
  { initials: "MA", name: "Matyáš", unlocked: 29, streak: "3 dny", status: "Připraven na výpravu" },
  { initials: "SO", name: "Sofi", unlocked: 21, streak: "2 dny", status: "Hledá další lokaci" }
];

export const safetySteps = [
  "Při startu mise odejde rodiči e-mail s lokací a časem.",
  "Aplikace hlídá, jestli jsi poblíž doporučené oblasti.",
  "Když hra skončí, rodič dostane potvrzení o dokončení."
];

export const squadMembers = [
  { name: "Týna", state: "Potvrzeno" },
  { name: "Ema", state: "Potvrzeno" },
  { name: "Sofi", state: "Čeká na připojení" }
];
