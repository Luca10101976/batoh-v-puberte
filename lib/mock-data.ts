export type TaskType = "question" | "photo" | "choice";

export type Task = {
  id: string;
  type: TaskType;
  typeLabel: string;
  title: string;
  content: string;
  options?: string[];
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
    distance: "11 min",
    boost: "+120 bodů",
    status: "Blízko tebe"
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
    name: "Park Klamovka",
    subtitle: "Posbírej ztracený příběh",
    teaser: "Park, kde něco chybí, něco nesedí a minulost se rozsypala na kousky.",
    story:
      "V Klamovce se ztratily kusy příběhu. Hodiny ukazují špatné časy, kůň Cassel má jen hlavu, na chrámku se jedna hlava usmívá a ostatní se mračí. Tvoje mise je posbírat stopy a vrátit tomu smysl.",
    image:
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
    unlocked: false,
    difficulty: "Střední",
    distance: "11 min od tebe",
    duration: "35-50 min",
    areaHint: "Doporučená oblast je přímo v parku Klamovka; když budeš mimo, hra tě upozorní.",
    vibe: ["Městská záhada", "Detaily, které unikají", "Ideální pro partu"],
    lat: 50.0669,
    lng: 14.3847,
    map: { x: 28, y: 58 },
    introLabel: "Úvodní mise",
    introStory:
      "Klamovka má dlouhou a divokou historii. Byly tu vinice Karla IV., pak klášter, Clam-Gallasové, barokní zámeček, vlci i medvědi, souboje, tramvaj, Sokol i underground. Dnes je to park, galerie a místo pro děti. Příběh je ale rozházený.",
    endingTitle: "Klamovka zase vypráví",
    endingStory:
      "Neposkládala jsi jen jednu hádanku. Posbírala jsi kusy minulosti, které tu zůstaly rozházené po celém parku. Klamovka není rozbitá. Je složená z mnoha časů najednou.",
    playerMessage:
      "Skvělá práce. Teď už víš, že Klamovka není jen park. Je to místo, kde detaily mluví hlasitěji než cedule.",
    interludes: [
      "Tohle nevypadá jako náhoda. Spíš jako park se zvláštní pamětí.",
      "Když něco chybí, bývá to většinou důležité.",
      "Jestli ti to připadá divné, jsi na správné stopě.",
      "Klamovka se nevysvětluje. Klamovka naznačuje."
    ],
    episodes: [
      {
        id: "chramek",
        name: "Chrámek noci a poznání",
        intro:
          "Nahoře nebe, dole peklo. Kruh a obdélník. Hvězdy i hadí hlavy. Chrámek vypadá, jako by se sám nemohl rozhodnout, čím chce být.",
        background:
          "Vznikl na konci 18. století za Clam-Gallasů. Horní část je nebe, dolní část je grota. Průzory v kopuli vytvářely iluzi hvězdné oblohy.",
        tasks: [
          {
            id: "klamovka-chramek-1",
            type: "question",
            typeLabel: "Otázka",
            title: "Hadí hlavy",
            content: "Kolik hadích hlav najdeš na sloupech?"
          },
          {
            id: "klamovka-chramek-2",
            type: "question",
            typeLabel: "Otázka",
            title: "Hvězdy na kopuli",
            content: "Kolik hvězdiček je na chrámku?"
          },
          {
            id: "klamovka-chramek-3",
            type: "question",
            typeLabel: "Otázka",
            title: "Úsměv mezi mračenými",
            content: "Jedna hlava se usmívá, ostatní se mračí. Kolik jich je mračených?"
          },
          {
            id: "klamovka-chramek-4",
            type: "choice",
            typeLabel: "Výběr",
            title: "Dvě poloviny",
            content: "Jak se jmenují dvě části chrámku nahoře a dole?",
            options: ["Nebe a peklo", "Den a noc", "Sláva a pád"]
          },
          {
            id: "klamovka-chramek-5",
            type: "photo",
            typeLabel: "Výzva na místě",
            title: "Vchod do pekla",
            content: "Najdi grotu zdola a potvrď, že působí jako vstup do podzemí."
          }
        ],
        clue: [
          "První kus příběhu je rozdělený na dvě poloviny: nebe a peklo.",
          "Něco tu očividně není v rovnováze.",
          "A přesto se uprostřed všeho jedna tvář usmívá."
        ]
      },
      {
        id: "cassel",
        name: "Cassel",
        intro:
          "Pomník má jen hlavu. Tělo chybí. A to je přesně ten typ podivnosti, který Klamovku dělá Klamovkou.",
        background:
          "Cassel byl vojenský kůň generála Eduarda Clam-Gallase. Pomník je datovaný rokem 1808 nebo 1838, historici se neshodnou.",
        tasks: [
          {
            id: "klamovka-cassel-1",
            type: "question",
            typeLabel: "Otázka",
            title: "Co chybí",
            content: "Pomník má jen hlavu. Co chybí?"
          },
          {
            id: "klamovka-cassel-2",
            type: "question",
            typeLabel: "Otázka",
            title: "Kdo to postavil",
            content: "V roce 1808 měl Eduard 3 roky. Kdo pomník nejspíš nechal postavit?"
          },
          {
            id: "klamovka-cassel-3",
            type: "question",
            typeLabel: "Otázka",
            title: "Schody k orlům",
            content: "Kolik schodů vede ke dvěma kamenným orlům v parku?"
          },
          {
            id: "klamovka-cassel-4",
            type: "photo",
            typeLabel: "Výzva na místě",
            title: "Vědro zblízka",
            content: "Najdi Casselovo vědro zblízka a potvrď, že připomíná stopu po zmizelém těle."
          },
          {
            id: "klamovka-cassel-5",
            type: "question",
            typeLabel: "Výzva",
            title: "Slovní hra",
            content: "Ze jména CASSEL slož aspoň 3 slova z jeho písmen."
          }
        ],
        clue: [
          "Druhý kus příběhu potvrzuje, že slavné věci někdy přežijí i napůl.",
          "U Cassela chybí tělo, ale stopa zůstala.",
          "Minulost tu odpadává po kouscích."
        ]
      },
      {
        id: "altan",
        name: "Novogotický altán",
        intro:
          "Altán působí tajemně už na první pohled. A ještě víc, když zjistíš, že se ho někdo pokusil nechat úplně zmizet.",
        background:
          "Altán byl postaven kolem roku 1820. Dnes je v něm malý výstavní prostor. V roce 2006 ho umělec Dominik Lang zakryl maskovací sítí.",
        tasks: [
          {
            id: "klamovka-altan-1",
            type: "question",
            typeLabel: "Otázka",
            title: "Hroty na střeše",
            content: "Kolik hrotů má střecha altánu?"
          },
          {
            id: "klamovka-altan-2",
            type: "question",
            typeLabel: "Otázka",
            title: "Co je uvnitř",
            content: "Co je dnes uvnitř altánu?"
          },
          {
            id: "klamovka-altan-3",
            type: "question",
            typeLabel: "Otázka",
            title: "Která zvířata byla v parku",
            content: "Jaká zvířata se podle dobových záznamů chovala v parku Klamovka?"
          },
          {
            id: "klamovka-altan-4",
            type: "photo",
            typeLabel: "Výzva na místě",
            title: "Gotické okno",
            content: "Najdi gotické okno altánu a podívej se skrz něj na park."
          }
        ],
        clue: [
          "Třetí kus příběhu se nerozsypal. Schoval se.",
          "Altán připomíná, že Klamovka umí mizet i bez kouzel.",
          "Park býval víc než jen park."
        ]
      },
      {
        id: "hodiny",
        name: "Hodiny Přijdu včas",
        intro:
          "Hodiny slibují, že přijdou včas. Jenže každá strana ukazuje jiný čas. A všechny špatně.",
        background:
          "Na dětském hřišti stojí dřevěná věž s hodinami. Jeden ciferník má starý znak Košíř, druhý logo Praha 5.",
        tasks: [
          {
            id: "klamovka-hodiny-1",
            type: "question",
            typeLabel: "Otázka",
            title: "Stejný čas",
            content: "Ukazují některé dvoje hodiny stejný čas?"
          },
          {
            id: "klamovka-hodiny-2",
            type: "question",
            typeLabel: "Otázka",
            title: "Sečti hodiny",
            content: "Sečti hodiny ze všech čtyř ciferníků. Minuty nepočítej."
          },
          {
            id: "klamovka-hodiny-3",
            type: "question",
            typeLabel: "Otázka",
            title: "Dvě identity místa",
            content: "Jak se jmenují dvě identity místa na cifernících?"
          },
          {
            id: "klamovka-hodiny-4",
            type: "choice",
            typeLabel: "Výběr",
            title: "Přijdu včas?",
            content: "Ukazují hodiny správný čas?",
            options: ["Ano", "Ne", "Možná v jiném vesmíru"]
          },
          {
            id: "klamovka-hodiny-5",
            type: "photo",
            typeLabel: "Výzva na místě",
            title: "Nejmatoucí ciferník",
            content: "Najdi nápis „Přijdu včas“ a vyber ciferník, který tě mate nejvíc."
          }
        ],
        clue: [
          "Čtvrtý kus příběhu je čas, který si dělá co chce.",
          "Minulost a současnost tu stojí vedle sebe.",
          "Čas je tu rozhozený stejně jako zbytek parku."
        ]
      },
      {
        id: "rodina",
        name: "Socha Rodiny",
        intro:
          "Na posledním místě čeká sousoší rodiny. A detail, který nejde přehlédnout, jakmile si ho všimneš.",
        background:
          "Autorem sousoší je sochař Karel Velický. Je z pískovce a tvoří ji žena, muž a dítě.",
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
            type: "photo",
            typeLabel: "Výzva na místě",
            title: "Nenápadný detail",
            content: "Najdi detail, kterého si většina lidí nevšimne, a potvrď ho."
          }
        ],
        clue: [
          "Pátý kus příběhu je konečně celý.",
          "Po všem rozpadlém je tu scéna, která drží pohromadě.",
          "Proto dává smysl, že hra končí právě tady."
        ]
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
