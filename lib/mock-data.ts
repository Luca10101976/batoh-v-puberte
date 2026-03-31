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
      "Klamovka má divokou historii: od vinic Karla IV. přes klášter a šlechtu až po Sokol a underground. Dnes je to park, galerie a místo pro děti. A když budeš koukat pozorně, narazíš tu i na koňskou hlavu nebo... zadek.",
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
        intro:
          "Nahoře nebe, dole peklo. Kruh i obdélník. Hvězdy i hadí hlavy. Chrámek působí, jako by byl složený ze dvou různých světů.",
        background:
          "Vznikl na konci 18. století za Clam-Gallasů. Horní část představuje nebe, dolní část podzemí. Díry v kopuli měly zevnitř vytvořit iluzi hvězdné oblohy.",
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
            title: "Spodní vstup chrámku",
            content: "Najdi spodní vstup chrámku a potvrď, že jsi ho našel/našla."
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
        intro:
          "Pomník má jen hlavu. Tělo chybí. Přesně ten typ podivnosti, kvůli kterému je Klamovka tak zvláštní.",
        background:
          "Cassel byl vojenský kůň generála Eduarda Clam-Gallase. Pomník se datuje rokem 1808 nebo 1838, historici se v tom neshodnou.",
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
            content: "V roce 1808 měl Eduard jen 3 roky. Kdo pomník nejspíš nechal postavit?"
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
            content: "Najdi u pomníku Casselovo vědro a potvrď, že jsi ho našel/našla."
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
          "Druhý kus příběhu ukazuje, že i slavné věci někdy přežijí jen napůl.",
          "U Cassela chybí tělo, ale stopa zůstala.",
          "Minulost tu odpadává po kouscích."
        ]
      },
      {
        id: "altan",
        name: "Novogotický altán",
        intro:
          "Altán vypadá tajemně už na první pohled. A ještě víc, když zjistíš, že ho někdo zkusil nechat úplně zmizet.",
        background:
          "Altán byl postaven kolem roku 1820. Dnes slouží jako malý výstavní prostor. V roce 2006 ho umělec Dominik Lang zakryl maskovací sítí.",
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
            title: "Okna altánu",
            content: "Najdi na altánu vysoká špičatá okna a potvrď, že jsi na správném místě."
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
        name: "Hodiny Přijdu včas",
        intro:
          "Hodiny slibují, že přijdou včas. Jenže každá strana ukazuje jiný čas a všechny špatně.",
        background:
          "Na dětském hřišti stojí dřevěná věž s hodinami. Na jednom ciferníku je starý znak Košíř, na jiném logo Praha 5.",
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
            title: "Nápis a ciferník",
            content: "Najdi nápis „Přijdu včas“ a vedle něj potvrď, že vidíš ciferník hodin."
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
        intro:
          "Na posledním místě tě čeká sousoší rodiny a detail, který už pak nepřehlédneš.",
        background:
          "Autorem sousoší je sochař Karel Velický. Je z pískovce a jsou na něm žena, muž a dítě.",
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
            title: "Detail na soše",
            content: "Najdi na sousoší Rodiny zadek dítěte a potvrď, že ho vidíš."
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
