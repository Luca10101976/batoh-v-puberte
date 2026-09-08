// Kurátorovaný slovník pro Traki klíč (R17).
//
// Každé slovo: skutečné české slovo, po odstranění diakritiky přesně 4 znaky A–Z,
// běžné, vhodné pro děti 10+. Žádná vlastní jména, značky, zkratky, slang,
// vulgarity, násilí, drogy, politika ani citlivá označení lidí.
//
// PRAVIDLA (hlídá lib/recovery-words-cs.test.ts):
//   - přesně 4 znaky, pouze A–Z, bez duplicit
//   - žádné slovo z RECOVERY_WORDS_BLOCKLIST
//   - minimálně RECOVERY_WORDS_MIN_COUNT slov
//
// DŮLEŽITÉ: slovník se používá VÝHRADNĚ při generování klíče.
// Redeem zadaný klíč pouze normalizuje a hashuje – NIKDY neověřuje, zda jeho
// slova ve slovníku stále jsou. Díky tomu přidání ani odebrání slov
// neovlivní už vydané klíče. Tuto vlastnost nikdy neměnit.

export const RECOVERY_WORDS_CS_VERSION = 1;
export const RECOVERY_WORD_LENGTH = 4;
export const RECOVERY_WORDS_MIN_COUNT = 300;

export const RECOVERY_WORDS_CS: readonly string[] = [
  // zvířata
  "BOBR", "CERV", "HUSA", "IBIS", "KACE", "KANE", "KAPR", "KIVI", "KOTE", "KOZA",
  "KRAB", "KUNA", "KURE", "LAMA", "MLOK", "MROZ", "MULA", "OREL", "OSEL", "OVAD",
  "OVCE", "PONY", "PTAK", "PUMA", "RYBA", "SELE", "SLON", "SOVA", "SRNA", "TELE",
  "TYGR", "UHOR", "VEPR", "VOSA", "ZABA",
  // části zvířat, hnízda
  "DRAP", "FOUS", "NORA", "OCAS", "PERI", "SRST", "VOSK",
  // příroda, krajina, počasí, čas
  "ALEJ", "BOJE", "BREH", "BROD", "DEST", "DNES", "DOBA", "DUHA", "DUNA", "HORA",
  "HROM", "JARO", "JILM", "KLAS", "KMEN", "KORA", "KOUR", "KVET", "LAVA", "LESK",
  "LETO", "LIPA", "LIST", "MECH", "MLHA", "MOLO", "MORE", "MRAK", "MRAZ", "NEBE",
  "OAZA", "OHEN", "OLSE", "PARA", "PENA", "PLAZ", "PLOD", "POLE", "RANO", "REKA",
  "ROSA", "RUZE", "SERO", "SMRK", "SNIH", "STEP", "STIN", "STOH", "SVAH", "SVET",
  "SVIT", "UTES", "VITR", "VODA", "VRBA", "VRCH", "ZARE", "ZEME", "ZIMA",
  // suroviny, materiály
  "KUZE", "OCEL", "PLYN", "ROPA", "RUDA", "SAZE", "SENO", "SKLO", "UHLI", "VLNA",
  "ZULA",
  // dům, věci doma
  "DEKA", "DREZ", "DUSE", "DVUR", "GAUC", "GUMA", "HADR", "KASA", "KLIC", "KUFR",
  "MISA", "OKAP", "OKNO", "PLOT", "PRAH", "PUDA", "SPIZ", "STAJ", "STAN", "STUL",
  "VANA", "VAZA", "ZVON",
  // nástroje, technika
  "BAGR", "DRAT", "KLIN", "LANO", "LUPA", "MLYN", "PAKA", "PILA", "PRUT", "SITO",
  "SNOP", "STEH", "TRAM", "UZDA", "UZEL", "VATA",
  // doprava, výlety
  "AUTO", "BOBY", "CLUN", "KARA", "KEMP", "KOLO", "LYZE", "SANE", "SRUB", "TAXI",
  "TURA", "VLAK", "VLEK",
  // místa
  "HALA", "HRAD", "KINO", "KRAJ", "MOST", "OBEC", "PARK", "POUT", "SPOJ", "TVRZ",
  // jídlo a pití
  "CUKR", "DORT", "DYNE", "DZEM", "DZUS", "HRIB", "KASE", "KAVA", "KMIN", "KOPR",
  "KREM", "MASO", "MATA", "OCET", "OLEJ", "OVES", "PEPR", "RYZE", "SODA", "SOJA",
  "VEKA", "ZELE", "ZELI", "ZITO",
  // tělo, rodina, postavy
  "CELO", "DEDA", "DITE", "DLAN", "DRAK", "DUCH", "HOST", "HRUD", "KLUK", "KOST",
  "KRAL", "MAMA", "NOHA", "PATA", "PAZE", "PRST", "PUSA", "RUKA", "SVAL", "TATA",
  "TETA", "TROL", "TVAR", "UCHO", "USTA", "VILA", "VLAS", "VNUK", "VOUS", "ZADA",
  // oblečení, věci pro hry a školu
  "BLOK", "BOTA", "DRES", "FILM", "FIXA", "KVIZ", "MAPA", "NOTA", "OBAL", "PERO",
  "SALA", "SATY", "STIT", "TERC", "TEST", "TRUN", "UKOL",
  // hudba, zvuky
  "ECHO", "GONG", "HLAS", "HLUK", "SBOR", "TAKT", "ZPEV", "ZVUK",
  // tvary, míry, jednoduché pojmy
  "CARA", "CAST", "CENA", "DIRA", "JAMA", "KILO", "KLUB", "KOPA", "KROK", "KRUH",
  "KUPA", "LITR", "METR", "MIRA", "OVAL", "PLAN", "PLES", "PRUH", "RADA", "SADA",
  "SILA", "SKOK", "SMER", "TRIK", "TRAT", "VAHA", "VETA", "VZOR", "ZNAK",
  // jednoduchá přídavná jména a slovesa
  "BILA", "CELY", "MALA", "MILA", "NOVA", "PLNY", "SEDA",
  "CIST", "HRAT", "JIST", "LEZT", "NEST", "PECT", "PRAT", "PSAT", "PTAT", "RUST",
  "SNIT", "SPAT", "TECI", "UCIT", "UMET", "VEST", "VZIT", "ZNAT"
];

// Explicitní blocklist – slova, která se nikdy nesmí dostat do slovníku
// (vulgarity, alkohol, drogy, násilí, urážky, citlivá označení, politika).
// Test hlídá, že žádné z nich ve slovníku není.
export const RECOVERY_WORDS_BLOCKLIST: readonly string[] = [
  "PIVO", "VINO", "SEXY", "PORN", "DROG", "KOKS", "HULI", "BOMB", "ZBRA", "PUSK",
  "MRTV", "SMRT", "KREV", "VRAH", "ZBIT", "BLBE", "BLBY", "DEBL", "IDIO", "KURV",
  "PICA", "PICE", "PRDE", "HOVN", "SRAT", "CURA", "BUZN", "BUZE", "NEGR", "CIKA",
  "ZIDE", "CERN", "STAT", "VLAD", "STRA", "PAPE", "MAGO", "HAJZ", "SVIN", "MRCH",
  "PEST", "MRIZ", "RASA", "TUPY", "HESL"
];
