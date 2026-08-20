/**
 * TICKET RADAR — motor de detección de ventas de boletos (México + EU)
 *
 * Fuente de verdad de la lógica. El contenido del motor va pegado en el nodo
 * Code de n8n; las listas MUSIC/SPORTS las lee build.js para generar las
 * búsquedas. Se prueba con:
 *   node radar.js --test
 *
 * QUÉ HACE
 *   1. Normaliza los eventos de la Ticketmaster Discovery API.
 *   2. AGRUPA: música por artista (una tour = una alerta); deportes por juego
 *      (cada partido tiene su propia venta).
 *   3. Solo considera ventas FUTURAS o recién abiertas — una venta pasada ya
 *      está vendida y avisarla es ruido.
 *   4. Puntúa por riesgo de sold-out; solo deja pasar alta probabilidad.
 *   5. Diff contra el snapshot + recordatorios antes de la venta.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Artistas fuertes (sold-out histórico). `cc` = países donde buscarlos.
 * build.js genera una búsqueda por (artista × país). El radar los marca "hot"
 * al hacer match por nombre. Para agregar a alguien, ponlo aquí y corre build.js.
 */
const MUSIC = [
  { kw: 'Coldplay', cc: ['MX', 'US'] },
  { kw: 'Bad Bunny', cc: ['MX', 'US'] },
  { kw: 'Taylor Swift', cc: ['US', 'MX'] },
  { kw: 'Beyonce', cc: ['US'] },
  { kw: 'Karol G', cc: ['MX', 'US'] },
  { kw: 'Shakira', cc: ['MX', 'US'] },
  { kw: 'Rosalia', cc: ['MX', 'US'] },
  { kw: 'Dua Lipa', cc: ['MX', 'US'] },
  { kw: 'BTS', cc: ['US', 'MX'] },
  { kw: 'Stray Kids', cc: ['US', 'MX'] },
  { kw: 'ENHYPEN', cc: ['US', 'MX'] },
  { kw: 'BLACKPINK', cc: ['US', 'MX'] },
  { kw: 'SEVENTEEN', cc: ['US', 'MX'] },
  { kw: 'TWICE', cc: ['US', 'MX'] },
  { kw: 'ATEEZ', cc: ['US', 'MX'] },
  { kw: 'Tomorrow X Together', cc: ['US', 'MX'] },
  { kw: 'Drake', cc: ['US'] },
  { kw: 'Kendrick Lamar', cc: ['US'] },
  { kw: 'SZA', cc: ['US'] },
  { kw: 'Morgan Wallen', cc: ['US'] },
  { kw: 'Zach Bryan', cc: ['US'] },
  { kw: 'Billie Eilish', cc: ['US', 'MX'] },
  { kw: 'Olivia Rodrigo', cc: ['US', 'MX'] },
  { kw: 'Sabrina Carpenter', cc: ['US', 'MX'] },
  { kw: 'Chappell Roan', cc: ['US'] },
  { kw: 'Post Malone', cc: ['US', 'MX'] },
  { kw: 'The Weeknd', cc: ['US', 'MX'] },
  { kw: 'Bruno Mars', cc: ['MX', 'US'] },
  { kw: 'Oasis', cc: ['US', 'MX'] },
  { kw: 'Iron Maiden', cc: ['MX', 'US'] },
  { kw: 'Junior H', cc: ['MX', 'US'] },
  { kw: 'Peso Pluma', cc: ['MX', 'US'] },
  { kw: 'Fuerza Regida', cc: ['MX', 'US'] },
  { kw: 'Grupo Frontera', cc: ['MX', 'US'] },
  { kw: 'Feid', cc: ['MX', 'US'] },
  // Rock/legado (buenos para flip, suelen ser transferibles)
  { kw: 'Metallica', cc: ['MX', 'US'] },
  { kw: 'AC/DC', cc: ['MX', 'US'] },
  { kw: 'Green Day', cc: ['MX', 'US'] },
  { kw: 'System of a Down', cc: ['MX', 'US'] },
  { kw: "Guns N' Roses", cc: ['MX', 'US'] },
  { kw: 'Linkin Park', cc: ['MX', 'US'] },
  { kw: 'My Chemical Romance', cc: ['MX', 'US'] },
  // Pop global
  { kw: 'Lady Gaga', cc: ['US', 'MX'] },
  { kw: 'Ariana Grande', cc: ['US', 'MX'] },
  { kw: 'Katy Perry', cc: ['US', 'MX'] },
  { kw: 'Charli XCX', cc: ['US', 'MX'] },
  { kw: 'Tate McRae', cc: ['US', 'MX'] },
  { kw: 'Gracie Abrams', cc: ['US', 'MX'] },
  // Latino / regional mexicano
  { kw: 'Luis Miguel', cc: ['MX', 'US'] },
  { kw: 'Grupo Firme', cc: ['MX', 'US'] },
  { kw: 'Christian Nodal', cc: ['MX', 'US'] },
  { kw: 'Carin Leon', cc: ['MX', 'US'] },
  { kw: 'Rauw Alejandro', cc: ['MX', 'US'] },
  { kw: 'Tini', cc: ['MX', 'US'] },
  { kw: 'Xavi', cc: ['MX', 'US'] },
  { kw: 'Neton Vega', cc: ['MX', 'US'] },
  { kw: 'Tito Double P', cc: ['MX', 'US'] },
  // K-pop (alta reventa, pero suele traer candado)
  { kw: 'LE SSERAFIM', cc: ['US', 'MX'] },
  { kw: 'IVE', cc: ['US', 'MX'] },
  { kw: 'aespa', cc: ['US', 'MX'] },
  { kw: 'NewJeans', cc: ['US', 'MX'] },
  { kw: '(G)I-DLE', cc: ['US', 'MX'] },
  { kw: 'NCT', cc: ['US', 'MX'] },
  { kw: 'RIIZE', cc: ['US', 'MX'] },
  { kw: 'BABYMONSTER', cc: ['US', 'MX'] },
  // Festivales (match best-effort por nombre; afinar si no cae)
  { kw: 'Corona Capital', cc: ['MX'] },
  { kw: 'EDC Mexico', cc: ['MX'] },
  // Reggaetón / regional que faltaban
  { kw: 'J Balvin', cc: ['MX', 'US'] },
  { kw: 'Maluma', cc: ['MX', 'US'] },
  { kw: 'Natanael Cano', cc: ['MX', 'US'] },
  { kw: 'Mana', cc: ['MX', 'US'] },
  // Comedia (Ticketmaster los lista como Arts & Theatre; el radar los reconoce por nombre)
  { kw: 'Franco Escamilla', cc: ['MX', 'US'] },
  { kw: 'Hablando Huevadas', cc: ['US', 'MX'] },
  { kw: 'Gabriel Iglesias', cc: ['US', 'MX'] },
  // Batch sold-out confiable (agosto 2026)
  { kw: 'Travis Scott', cc: ['US', 'MX'] },
  { kw: 'Justin Bieber', cc: ['US', 'MX'] },
  { kw: 'Twenty One Pilots', cc: ['US', 'MX'] },
  { kw: 'Imagine Dragons', cc: ['US', 'MX'] },
  { kw: 'ITZY', cc: ['US', 'MX'] },
  { kw: 'Los Angeles Azules', cc: ['MX', 'US'] },
  { kw: 'Ivan Cornejo', cc: ['MX', 'US'] },
  { kw: 'Gabito Ballesteros', cc: ['MX', 'US'] },
  { kw: 'Anuel AA', cc: ['MX', 'US'] },
  { kw: 'Ozuna', cc: ['MX', 'US'] },
  { kw: 'Alejandro Fernandez', cc: ['MX', 'US'] },
  { kw: 'Marco Antonio Solis', cc: ['MX', 'US'] },
];

/**
 * Deportes marquee (perfil de sold-out). Se busca por nombre de equipo/figura y
 * se hace match por ese mismo nombre en el evento. Predecir sold-out deportivo
 * es difuso — esta lista es un punto de partida para afinar con datos reales.
 */
const SPORTS = [
  // México — `kw` es el término de búsqueda; `m` el token con que se reconoce
  // el evento (los listados suelen usar el nombre corto: "Cowboys", "Lakers").
  { kw: 'Club America', m: 'américa', cc: ['MX'] },
  { kw: 'Chivas Guadalajara', m: 'chivas', cc: ['MX'] },
  { kw: 'Cruz Azul', m: 'cruz azul', cc: ['MX'] },
  { kw: 'Pumas UNAM', m: 'pumas', cc: ['MX'] },
  { kw: 'Rayados Monterrey', m: 'rayados', cc: ['MX'] },
  { kw: 'Tigres UANL', m: 'tigres', cc: ['MX'] },
  { kw: 'Seleccion Mexicana', m: 'seleccion mexicana', cc: ['MX'] },
  { kw: 'Mexico National Team', m: 'mexico national', cc: ['US'] },
  { kw: 'Canelo Alvarez', m: 'canelo', cc: ['MX', 'US'] },
  // Estados Unidos
  { kw: 'Dallas Cowboys', m: 'cowboys', cc: ['US'] },
  { kw: 'Kansas City Chiefs', m: 'chiefs', cc: ['US'] },
  { kw: 'Philadelphia Eagles', m: 'eagles', cc: ['US'] },
  { kw: 'San Francisco 49ers', m: '49ers', cc: ['US', 'MX'] },
  { kw: 'Minnesota Vikings', m: 'vikings', cc: ['US', 'MX'] },
  { kw: 'Buffalo Bills', m: 'bills', cc: ['US'] },
  { kw: 'NFL Mexico', m: 'nfl', cc: ['MX'] },
  { kw: 'NBA Mexico', m: 'nba', cc: ['MX'] },
  { kw: 'Los Angeles Lakers', m: 'lakers', cc: ['US'] },
  { kw: 'Golden State Warriors', m: 'warriors', cc: ['US'] },
  { kw: 'Boston Celtics', m: 'celtics', cc: ['US'] },
  { kw: 'New York Knicks', m: 'knicks', cc: ['US'] },
  { kw: 'Oklahoma City Thunder', m: 'thunder', cc: ['US'] },
  { kw: 'Denver Nuggets', m: 'nuggets', cc: ['US'] },
  { kw: 'New York Yankees', m: 'yankees', cc: ['US'] },
  { kw: 'Los Angeles Dodgers', m: 'dodgers', cc: ['US'] },
  { kw: 'Green Bay Packers', m: 'packers', cc: ['US'] },
  { kw: 'Pittsburgh Steelers', m: 'steelers', cc: ['US'] },
  { kw: 'UFC', m: 'ufc', cc: ['US', 'MX'] },
  // Box (eventos individuales; 1 figura marquee ya califica). Canelo ya está arriba.
  { kw: 'Ryan Garcia', m: 'ryan garcia', cc: ['US', 'MX'] },
  { kw: 'Gervonta Davis', m: 'gervonta', cc: ['US'] },
  { kw: 'Jake Paul', m: 'jake paul', cc: ['US'] },
  // Fórmula 1 y lucha (géneros especiales; 1 token marquee califica)
  { kw: 'Formula 1', m: 'formula 1', cc: ['MX', 'US'] },
  { kw: 'WrestleMania', m: 'wrestlemania', cc: ['US'] },
  { kw: 'Triplemania', m: 'triplemania', cc: ['MX'] },
  { kw: 'US Open Tennis', m: 'us open', cc: ['US'] },
  // Efecto estrella: se agotan SIN importar rival → ver SOLO_MARQUEE abajo.
  { kw: 'Inter Miami', m: 'inter miami', cc: ['US', 'MX'] },   // Messi
  { kw: 'Orlando City', m: 'orlando city', cc: ['US', 'MX'] }, // Griezmann
  { kw: 'LAFC', m: 'lafc', cc: ['US', 'MX'] },                 // Son Heung-min
];

/**
 * WISHLIST = cazar goteos (production releases + preventas + venta) de un show,
 * uno por uno, con su hora exacta y checklist de reventa. Ahora cubre TODO lo
 * del radar: todos los artistas de MUSIC y todos los deportes que califican
 * (playoffs/finales, choques de 2 grandes, box/UFC). Así no se pierde ningún
 * goteo. (Ver isWishlist más abajo.)
 *
 * Búsquedas EXTRA para la wishlist deportiva (playoffs/finales). Solo para que
 * Fuentes los traiga; el radar los reconoce por ser final/playoff (bigStage).
 */
const WISHLIST_SPORTS_SEARCH = [
  { kw: 'NBA Finals', cc: ['US'] },
  { kw: 'NBA Playoffs', cc: ['US'] },
  { kw: 'NFL Playoffs', cc: ['US'] },
  { kw: 'Super Bowl', cc: ['US'] },
  { kw: 'World Series', cc: ['US'] },
  { kw: 'Stanley Cup', cc: ['US'] },
  { kw: 'Liga MX Liguilla', cc: ['MX'] },
];

/**
 * Normaliza para comparar: minúsculas, sin acentos, sin signos, espacios
 * colapsados. "Rosalía" → "rosalia"; "A Tribute to Taylor Swift" → "a tribute
 * to taylor swift".
 */
function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Música: match EXACTO del artista, no "contiene". Así "Drake" ≠ "Drake White". */
const MUSIC_SET = new Set(MUSIC.map((m) => norm(m.kw)));
/** Deportes: tokens de equipo/figura, comparados como palabra completa. */
const SPORTS_TOKENS = SPORTS.map((s) => norm(s.m ?? s.kw));

/**
 * Tributos, homenajes y sinfónicos NO son el artista real. La búsqueda de
 * "Taylor Swift" trae "A Tribute to Taylor Swift"; esto lo descarta.
 */
const TRIBUTE_RE = /tribute|tributo|homenaje|candlelight|sinfonico|orquesta sinfonica|cover band/i;

/**
 * Pretemporada / exhibición: las estrellas descansan, la demanda es baja y la
 * reventa sale plana o negativa. No sirve para flip. Se detecta en el nombre
 * del evento O en el nombre de las preventas ("Preseason Ticket Presale").
 */
const PRESEASON_RE = /preseason|pretemporada|exhibition|exhibición|amistoso|friendly/i;

function isPreseason(ev) {
  if (PRESEASON_RE.test(ev.name)) return true;
  return (ev.presales || []).some((p) => PRESEASON_RE.test(p.name || ''));
}

/**
 * Deportes solo de estos tipos. Excluye voleibol, etc., que se colaba por el
 * nombre del equipo/país. (Géneros ya normalizados: "Motorsports/Racing" →
 * "motorsports racing".)
 */
const SPORTS_GENRES = new Set([
  'soccer', 'football', 'basketball', 'baseball', 'hockey',
  'boxing', 'mixed martial arts', 'motorsports racing', 'racing', 'wrestling', 'tennis',
]);

/**
 * Géneros de EVENTO INDIVIDUAL: box, MMA, F1, lucha. Aquí 1 token marquee ya
 * califica (no necesitan "2 equipos" ni playoff, no aplica).
 */
const SINGLE_EVENT_GENRES = new Set(['boxing', 'mixed martial arts', 'motorsports racing', 'racing', 'wrestling', 'tennis']);

/**
 * Equipos que se agotan SOLOS, sin importar el rival (efecto Messi). Para estos,
 * 1 token ya califica aunque el otro equipo no sea marquee — casa y visita.
 */
const SOLO_MARQUEE = ['inter miami', 'orlando city', 'lafc', 'seleccion mexicana', 'mexico national'];

/** ¿El token aparece como palabra completa en el texto normalizado? */
function tokenIn(hayNorm, tok) {
  return ` ${hayNorm} `.includes(` ${tok} `);
}

/** Palabras que suben el score de un evento deportivo (juego de alto interés). */
const SPORTS_BONUS = ['final', 'playoff', 'semifinal', 'clasico', 'championship', 'conference', 'world series', 'super bowl'];

/** Géneros musicales con historial de agotamiento inmediato. */
const GENRE_SCORE = {
  'k-pop': 40, 'pop': 30, 'rock': 25, 'latin': 25, 'metal': 20,
  'hip-hop/rap': 20, 'alternative': 15, 'r&b': 15, 'undefined': 0,
};

/** Recintos grandes = techo de inventario. Menos asientos, más pelea. */
const VENUE_SCORE = {
  // México
  'estadio gnp seguros': 30, 'foro sol': 30, 'estadio banorte': 30, 'estadio azteca': 30,
  'estadio ciudad de los deportes': 25, 'palacio de los deportes': 20,
  'arena ciudad de mexico': 20, 'arena ciudad de méxico': 20, 'arena monterrey': 15,
  'arena vfg': 15, 'auditorio nacional': 15, 'auditorio telmex': 12,
  // Estados Unidos
  'sofi stadium': 30, 'metlife stadium': 30, 'at&t stadium': 30, 'arrowhead': 30,
  'allegiant stadium': 30, 'levi\'s stadium': 30, 'gillette stadium': 28,
  'madison square garden': 25, 'crypto.com arena': 22, 'chase center': 20,
  'united center': 20, 'yankee stadium': 25, 'dodger stadium': 25, 'fenway park': 22,
};

/** Umbral para artistas/eventos NO marquee. Estricto: solo lo casi seguro. */
const SCORE_THRESHOLD = 70;

/** "Recién salió a la venta": abrió hace menos de esto → aún accionable. */
const ACTIONABLE_RECENT_HOURS = 24;

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZACIÓN
// ─────────────────────────────────────────────────────────────────────────────

function normalize(raw) {
  const venue = raw?._embedded?.venues?.[0] ?? {};
  const attraction = raw?._embedded?.attractions?.[0] ?? {};
  const cls = raw?.classifications?.[0] ?? {};
  const sales = raw?.sales ?? {};

  const presales = (sales.presales ?? []).map((p) => ({
    name: p.name ?? 'Preventa',
    start: p.startDateTime ?? null,
    end: p.endDateTime ?? null,
  }));

  return {
    id: raw?.id ?? null,
    name: raw?.name ?? '(sin nombre)',
    artist: attraction.name ?? raw?.name ?? '(sin artista)',
    url: raw?.url ?? null,
    showDate: raw?.dates?.start?.localDate ?? null,
    showTime: raw?.dates?.start?.localTime ?? null,
    status: raw?.dates?.status?.code ?? 'unknown',
    venue: venue.name ?? '(sin recinto)',
    city: venue?.city?.name ?? '',
    country: venue?.country?.countryCode ?? '',
    genre: cls?.genre?.name ?? 'undefined',
    segment: cls?.segment?.name ?? '',
    publicOnsale: sales?.public?.startDateTime ?? null,
    publicOffsale: sales?.public?.endDateTime ?? null,
    presales,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORING
// ─────────────────────────────────────────────────────────────────────────────

function isSports(ev) {
  return String(ev.segment).toLowerCase() === 'sports';
}

/** Tributo/homenaje/sinfónico → nunca es el artista real. */
function isTribute(ev) {
  return TRIBUTE_RE.test(ev.artist) || TRIBUTE_RE.test(ev.name);
}

/**
 * ¿Es un show de la wishlist (cazar goteos)? Cubre TODO el radar:
 *  - Música: cualquier artista de MUSIC (match exacto, sin tributos).
 *  - Deportes: cualquiera que califique (playoff/final, 2 grandes, box/UFC).
 * Así ningún goteo se pierde.
 */
function isWishlist(ev) {
  if (isTribute(ev)) return false;
  if (isSports(ev)) return sportsQualifies(ev);
  return MUSIC_SET.has(norm(ev.artist));
}

/**
 * ¿El evento es de un artista/equipo de la lista?
 *  - Música: match EXACTO del nombre del artista (no substring) → "Drake" no
 *    matchea "Drake White", y los tributos quedan fuera.
 *  - Deportes: token de equipo como palabra completa, Y de un tipo relevante
 *    (fútbol/básquet/box…), lo que descarta voleibol y demás.
 */
function isMarquee(ev) {
  if (isTribute(ev)) return false;
  if (isSports(ev)) {
    if (!SPORTS_GENRES.has(norm(ev.genre))) return false;
    const hay = norm(`${ev.artist} ${ev.name}`);
    return SPORTS_TOKENS.some((tok) => tokenIn(hay, tok));
  }
  return MUSIC_SET.has(norm(ev.artist));
}

function venueScore(ev) {
  const vKey = String(ev.venue).toLowerCase();
  const hit = Object.keys(VENUE_SCORE).find((k) => vKey.includes(k));
  return hit ? { pts: VENUE_SCORE[hit], label: `recinto ${ev.venue} (+${VENUE_SCORE[hit]})` } : null;
}

function scoreMusic(ev, dateCount) {
  const reasons = [];
  let s = 0;

  if (isMarquee(ev)) { s += 50; reasons.push('artista fuerte'); }

  const g = GENRE_SCORE[String(ev.genre).toLowerCase()] ?? 0;
  if (g) { s += g; reasons.push(`género ${ev.genre} (+${g})`); }

  const v = venueScore(ev);
  if (v) { s += v.pts; reasons.push(v.label); }

  // Múltiples fechas = la demanda rebasó una sola noche (Rosalía: 2→5 fechas).
  if (dateCount >= 3) { s += 20; reasons.push(`${dateCount} fechas anunciadas (+20)`); }
  else if (dateCount === 2) { s += 10; reasons.push('2 fechas anunciadas (+10)'); }

  return { score: s, reasons };
}

/** Cuántos equipos/figuras marquee aparecen en el evento, y si es playoff/final. */
function sportsSignals(ev) {
  const hay = norm(`${ev.artist} ${ev.name}`);
  const marqueeCount = SPORTS_TOKENS.filter((t) => tokenIn(hay, t)).length;
  const bigStage = SPORTS_BONUS.some((k) => hay.includes(k));
  return { marqueeCount, bigStage };
}

/**
 * ¿El evento deportivo es de altísima demanda (≈90% sold-out)?
 *  - Box / MMA: evento marquee (Canelo, UFC) → califica.
 *  - Deportes de temporada (NFL, NBA, MLB, fútbol): NO basta un equipo grande;
 *    debe ser PLAYOFF/FINAL o un choque de DOS equipos grandes (rivalidad).
 *    Un partido de temporada regular normal NO alerta.
 */
function sportsQualifies(ev) {
  if (isTribute(ev) || isPreseason(ev)) return false;
  const genre = norm(ev.genre);
  if (!SPORTS_GENRES.has(genre)) return false;

  const { marqueeCount, bigStage } = sportsSignals(ev);
  const hay = norm(`${ev.artist} ${ev.name}`);

  // Ligas de EU en México (NFL/NBA): eventos internacionales raros, se agotan.
  if (ev.country === 'MX') {
    // Football americano en MX = solo NFL (el soccer mexicano es genre "Soccer").
    if (genre === 'football') return true;
    // Basket en MX: exige "NBA" o un equipo grande, para no confundir con liga
    // mexicana (LNBP).
    if (genre === 'basketball' && (tokenIn(hay, 'nba') || marqueeCount >= 1)) return true;
  }

  if (SINGLE_EVENT_GENRES.has(genre)) return marqueeCount >= 1;
  // Temporada regular: playoff/final, choque de 2 grandes, o un equipo que se
  // agota solo (Messi). Un partido normal de 1 solo equipo grande no basta.
  const solo = SOLO_MARQUEE.some((t) => tokenIn(hay, t));
  return bigStage || marqueeCount >= 2 || solo;
}

function scoreSports(ev) {
  const reasons = [];
  let s = 0;

  const { marqueeCount, bigStage } = sportsSignals(ev);
  if (marqueeCount >= 2) { s += 60; reasons.push('choque de 2 equipos grandes'); }
  else if (marqueeCount === 1) { s += 40; reasons.push('equipo/figura marquee'); }
  if (bigStage) { s += 30; reasons.push('playoff/final (+30)'); }

  const v = venueScore(ev);
  if (v) { s += v.pts; reasons.push(v.label); }

  return { score: s, reasons };
}

function score(ev, dateCount) {
  return isSports(ev) ? scoreSports(ev) : scoreMusic(ev, dateCount);
}

// ─────────────────────────────────────────────────────────────────────────────
// TIEMPO DE VENTA
// ─────────────────────────────────────────────────────────────────────────────

function hoursUntil(iso, now) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (t - now) / 36e5;
}

/**
 * Ancla en la VENTA GENERAL (public onsale). Una preventa suelta NO define el
 * estado por sí sola: Ticketmaster libera "Limited Production Release" y otros
 * goteos de asientos apartados DESPUÉS de que un show ya se agotó. Si la venta
 * general ya pasó, esos goteos NO son "la venta aún no abre".
 *
 * Reglas:
 *  - Venta general futura → 'upcoming'; la ventana más cercana puede ser una
 *    preventa que la antecede (esa sí es lead-up legítimo).
 *  - Venta general abrió hace <24 h → 'onsale_now'.
 *  - Venta general ya pasada (agotado / a la venta hace rato) → 'past', aunque
 *    haya goteos de producción futuros.
 *  - Sin venta general listada → usa preventas futuras como fallback.
 */
function saleTiming(group, now) {
  const publics = [];
  const presales = [];
  for (const ev of group) {
    if (ev.publicOnsale) publics.push({ label: 'Venta general', at: ev.publicOnsale, h: hoursUntil(ev.publicOnsale, now) });
    for (const p of ev.presales) {
      if (p.start) presales.push({ label: p.name, at: p.start, h: hoursUntil(p.start, now) });
    }
  }
  const validPublic = publics.filter((w) => w.h !== null);
  const futurePublic = validPublic.filter((w) => w.h >= 0).sort((a, b) => a.h - b.h);
  const recentPublic = validPublic.filter((w) => w.h < 0 && w.h >= -ACTIONABLE_RECENT_HOURS).sort((a, b) => b.h - a.h);

  if (futurePublic.length) {
    // La más cercana puede ser una preventa PREVIA a esa venta general futura.
    const cutoff = futurePublic[0].h;
    const leadPre = presales.filter((w) => w.h !== null && w.h >= 0 && w.h <= cutoff);
    const nearest = [...leadPre, futurePublic[0]].sort((a, b) => a.h - b.h)[0];
    return { state: 'upcoming', nearest };
  }
  if (recentPublic.length) return { state: 'onsale_now', nearest: recentPublic[0] };

  // Sin ninguna venta general listada: fallback a preventas futuras (raro, pero
  // algunos eventos son solo-preventa). Si SÍ hubo venta general y ya pasó, no
  // llegamos aquí → 'past', ignorando goteos de producción.
  if (validPublic.length === 0) {
    const futurePre = presales.filter((w) => w.h !== null && w.h >= 0).sort((a, b) => a.h - b.h);
    if (futurePre.length) return { state: 'upcoming', nearest: futurePre[0] };
  }
  return { state: 'past', nearest: null };
}

/**
 * TODAS las ventanas futuras del grupo (preventas + production releases + venta
 * general), ordenadas por cercanía. Para el modo wishlist: aquí un goteo sobre
 * un show agotado SÍ cuenta.
 */
function allFutureWindows(group, now) {
  const wins = [];
  for (const ev of group) {
    for (const p of ev.presales) {
      if (p.start) wins.push({ label: p.name, at: p.start, h: hoursUntil(p.start, now) });
    }
    if (ev.publicOnsale) wins.push({ label: 'Venta general', at: ev.publicOnsale, h: hoursUntil(ev.publicOnsale, now) });
  }
  return wins.filter((w) => w.h !== null && w.h >= 0).sort((a, b) => a.h - b.h);
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECCIÓN
// ─────────────────────────────────────────────────────────────────────────────

function detect(rawEvents, seen, now) {
  // Dedup por id: la misma pelea/juego puede venir de dos búsquedas distintas.
  const byId = new Map();
  for (const raw of rawEvents) {
    const ev = normalize(raw);
    if (ev.id && !byId.has(ev.id)) byId.set(ev.id, ev);
  }
  const events = Array.from(byId.values());

  // Agrupa: wishlist y deportes por evento (cada fecha con su liga y sus
  // goteos); música normal por artista (una tour = una alerta).
  const groups = {};
  for (const ev of events) {
    // Deportes: por evento (cada juego es su venta). Música (wishlist o normal):
    // por ARTISTA → una gira = un grupo (y la wishlist deduplica ventanas para
    // no mandar 70 avisos de una gira de 10 ciudades con la misma fecha de venta).
    const key = isSports(ev) ? `evt|${ev.id}` : `music|${String(ev.artist).toLowerCase().trim()}`;
    (groups[key] = groups[key] || []).push(ev);
  }

  const alerts = [];

  for (const key of Object.keys(groups)) {
    const group = groups[key];
    const rep = group[0];
    const dateCount = group.length;

    const dates = group.map((e) => e.showDate).filter(Boolean).sort();
    const notifiedPrev = seen[key]?.notified ?? {};
    const agg = {
      artist: rep.artist,
      segment: rep.segment,
      venues: Array.from(new Set(group.map((e) => e.venue))),
      city: rep.city,
      country: rep.country,
      dateCount,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
      url: rep.url,
      presales: rep.presales,
      publicOnsale: rep.publicOnsale,
    };

    // ── MODO WISHLIST: cazar goteos ─────────────────────────────────────────
    // Avisa de CADA ventana futura (production release + preventas + venta),
    // una vez cada una. Aquí un goteo sobre un show agotado SÍ importa.
    if (isWishlist(rep)) {
      seen[key] = { fp: 'wish', notified: notifiedPrev };
      // Deduplica ventanas por (etiqueta + hora): una gira de 10 ciudades con la
      // misma fecha de venta = 1 aviso ("10 fechas"), no 10.
      const byWin = new Map();
      for (const w of allFutureWindows(group, now)) {
        const wk = `${w.label}|${w.at}`;
        if (!byWin.has(wk)) byWin.set(wk, { ...w, count: 0 });
        byWin.get(wk).count += 1;
      }
      const wins = [...byWin.values()].sort((a, b) => a.h - b.h);
      for (const w of wins) {
        const nFechas = w.count > 1 ? ` · ${w.count} fechas` : '';
        // 1) Aviso inicial: la primera vez que vemos esta ventana.
        const nkey = `wish:${w.label}:${w.at}`;
        const firstTime = !notifiedPrev[nkey];
        if (firstTime) {
          notifiedPrev[nkey] = true;
          alerts.push({
            kind: 'WISHLIST', wishlist: true, saleState: 'upcoming', nearest: w, agg,
            score: 999, reasons: [`show en tu wishlist${nFechas}`],
            priority: w.h <= 2 ? 0 : w.h <= 48 ? 1 : 2,
          });
        }
        // 2) Recordatorios (una vez cada uno) para que no se te olvide:
        //    ≤24 h antes y ≤2 h (última llamada).
        const tiers = [
          { key: `r2:${w.at}`, max: 2, min: -0.01, priority: 0 },
          { key: `r24:${w.at}`, max: 24, min: 2, priority: 1 },
        ];
        for (const t of tiers) {
          if (w.h > t.max || w.h <= t.min || notifiedPrev[t.key]) continue;
          notifiedPrev[t.key] = true;
          if (firstTime) continue; // el aviso inicial de esta corrida ya trae el timing
          alerts.push({
            kind: 'RECORDATORIO', wishlist: true, saleState: 'upcoming', nearest: w, agg,
            score: 999, reasons: [`recordatorio de tu wishlist${nFechas}`],
            priority: t.priority,
          });
        }
      }
      continue;
    }

    const { score: s, reasons } = score(rep, dateCount);
    // Deportes: gate estricto (playoff/final o choque de 2 grandes; box/UFC
    // marquee). Música: artista de la lista, o score alto — nunca tributos.
    const hot = isSports(rep)
      ? sportsQualifies(rep)
      : (!isTribute(rep) && (isMarquee(rep) || s >= SCORE_THRESHOLD));

    const timing = saleTiming(group, now);
    const fp = JSON.stringify({ dates, st: timing.state });

    const prev = seen[key];
    const wasSeen = Boolean(prev);
    seen[key] = { fp, notified: notifiedPrev };

    if (!hot || timing.state === 'past') continue;

    const notified = notifiedPrev;

    // Alerta principal: primera vez, o fecha nueva.
    const changed = !wasSeen || prev.fp !== fp;
    let primaryFired = false;
    if (changed) {
      const h = timing.nearest.h;
      alerts.push({
        kind: wasSeen ? 'CAMBIO' : 'NUEVO',
        saleState: timing.state,
        nearest: timing.nearest,
        agg, score: s, reasons,
        priority: timing.state === 'onsale_now' ? 0 : h <= 24 ? 0 : h <= 72 ? 1 : 2,
      });
      primaryFired = true;
    }

    // Recordatorios antes de la venta (una vez por ventana).
    if (timing.state === 'upcoming') {
      const near = timing.nearest;
      const tiers = [
        { key: `r2:${near.at}`, max: 2, min: -0.01, priority: 0 },
        { key: `r48:${near.at}`, max: 48, min: 2, priority: 1 },
      ];
      for (const t of tiers) {
        if (near.h > t.max || near.h <= t.min || notified[t.key]) continue;
        notified[t.key] = true;
        if (primaryFired) continue;
        alerts.push({ kind: 'RECORDATORIO', saleState: 'upcoming', nearest: near, agg, score: s, reasons, priority: t.priority });
      }
    }
  }

  alerts.sort((a, b) => a.priority - b.priority || b.score - a.score);
  return alerts;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMATO
// ─────────────────────────────────────────────────────────────────────────────

function humanizeLead(h) {
  if (h == null) return '';
  if (h < 0) return 'ya abrió';
  if (h < 1) return 'en menos de 1 h';
  if (h < 48) return `en ~${Math.round(h)} h`;
  return `en ~${Math.round(h / 24)} días`;
}

const HEADER = {
  upcoming: '🎯 SOLD-OUT PROBABLE — la venta aún no abre',
  onsale_now: '🟢 SOLD-OUT PROBABLE — ¡ACABA de salir a la venta!',
};

function reminderHeader(h) {
  return h <= 2
    ? '🚨 ÚLTIMA LLAMADA — la venta abre YA. Ten tarjeta lista y métete a la fila.'
    : '⏰ RECORDATORIO — la venta abre pronto. Prepara tu registro y tu tarjeta.';
}

function headerFor(a) {
  if (a.kind === 'WISHLIST') {
    return a.nearest.h <= 2
      ? `👀 WISHLIST — ¡goteo abre YA! (${a.nearest.label})`
      : `👀 WISHLIST — goteo/venta próxima (${a.nearest.label})`;
  }
  if (a.kind === 'CAMBIO') return '🔄 CAMBIO — nueva fecha o venta movida';
  if (a.kind === 'RECORDATORIO') return reminderHeader(a.nearest.h);
  return HEADER[a.saleState];
}

function formatAlert(a) {
  const g = a.agg;
  const lines = [];
  const flag = g.country === 'US' ? '🇺🇸' : g.country === 'MX' ? '🇲🇽' : '';
  const icon = String(g.segment).toLowerCase() === 'sports' ? '🏟️' : '🎵';

  lines.push(headerFor(a));
  // Los avisos de wishlist (WISHLIST y sus RECORDATORIOs) NO muestran score:
  // el 999 es un marcador interno, no un dato para el usuario.
  lines.push(a.wishlist ? `${icon} *${g.artist}* ${flag}` : `${icon} *${g.artist}* ${flag} — score ${a.score}`);

  const venue = g.venues[0] + (g.venues.length > 1 ? ` (+${g.venues.length - 1} recinto/s)` : '');
  lines.push(`📍 ${venue}${g.city ? `, ${g.city}` : ''}`);

  if (g.dateCount > 1) lines.push(`🗓️ ${g.dateCount} fechas: ${g.firstDate} → ${g.lastDate}`);
  else if (g.firstDate) lines.push(`🗓️ ${g.firstDate}`);

  if (a.nearest) lines.push(`🚨 ${a.nearest.label} ${humanizeLead(a.nearest.h)} (${a.nearest.at})`);

  lines.push(`💡 ${a.reasons.join(' · ')}`);
  if (g.url) lines.push(`🔗 ${g.url}`);

  if (a.kind === 'WISHLIST') {
    // Mini-guía de reventa. La API no confirma transferibilidad, así que el
    // paso 1 (verificar en la página) es obligatorio antes de comprar.
    lines.push('');
    lines.push('💰 *Checklist reventa:*');
    lines.push('1️⃣ Abre la liga y confirma que sea *transferible* — evita "non-transferable / ID en puerta / face value exchange" (EU/MX normalmente OK).');
    lines.push('2️⃣ Compra a precio de taquilla al abrir esta venta/goteo (cuenta verificada + tarjeta lista).');
    lines.push('3️⃣ Revende por la *reventa oficial de Ticketmaster* — maneja el traspaso sin bronca.');
    lines.push('4️⃣ Ojo: si es mobile-only, el código suele liberarse ~48 h antes del show.');
  } else if (a.saleState === 'upcoming' && g.presales.some((p) => /fan|verified|registro/i.test(p.name ?? ''))) {
    lines.push('⚠️ Hay preventa de fans → busca YA el link de registro; suele cerrar antes de que abra la preventa.');
  }

  return lines.join('\n');
}

function waParams(a) {
  const g = a.agg;
  const oneLine = (s) => String(s ?? '—').replace(/\s+/g, ' ').trim();

  const tipo =
    a.kind === 'WISHLIST' ? `WISHLIST — goteo/venta (${a.nearest.label})`
      : a.kind === 'CAMBIO' ? 'CAMBIO — nueva fecha o venta movida'
        : a.kind === 'RECORDATORIO' ? (a.nearest.h <= 2 ? 'ULTIMA LLAMADA — la venta abre ya' : 'RECORDATORIO — la venta abre pronto')
          : a.saleState === 'onsale_now' ? 'SOLD-OUT PROBABLE — ¡acaba de salir a la venta!'
            : 'SOLD-OUT PROBABLE — la venta aún no abre';

  const fechas = g.dateCount > 1 ? `${g.dateCount} fechas ${g.firstDate}–${g.lastDate}` : (g.firstDate ?? '?');
  const venta = a.nearest ? `${a.nearest.label} ${humanizeLead(a.nearest.h)}` : 'sin fecha de venta';
  const detalle = a.wishlist ? fechas : `${fechas} · score ${a.score}`;

  return [
    oneLine(tipo),                                                     // {{1}}
    oneLine(`${g.artist}${g.country ? ` (${g.country})` : ''}`),       // {{2}}
    oneLine(`${g.venues[0]}${g.city ? `, ${g.city}` : ''}`),           // {{3}}
    oneLine(detalle),                                                  // {{4}}
    oneLine(venta),                                                    // {{5}}
    oneLine(g.url ?? 'sin liga'),                                      // {{6}}
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRYPOINT PARA n8n
// ─────────────────────────────────────────────────────────────────────────────

function run(rawEvents, staticData, now) {
  staticData.seen = staticData.seen ?? {};
  const alerts = detect(rawEvents, staticData.seen, now);

  const keys = Object.keys(staticData.seen);
  if (keys.length > 5000) {
    for (const k of keys.slice(0, keys.length - 5000)) delete staticData.seen[k];
  }

  return alerts.map((a) => ({
    json: {
      kind: a.kind,
      saleState: a.saleState,
      segment: a.agg.segment,
      country: a.agg.country,
      score: a.score,
      artist: a.agg.artist,
      venues: a.agg.venues,
      city: a.agg.city,
      dateCount: a.agg.dateCount,
      firstDate: a.agg.firstDate,
      lastDate: a.agg.lastDate,
      nearestSale: a.nearest ? { label: a.nearest.label, at: a.nearest.at, hoursLeft: Math.round(a.nearest.h) } : null,
      url: a.agg.url,
      text: formatAlert(a),
      waParams: waParams(a),
    },
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST — node radar.js --test
// ─────────────────────────────────────────────────────────────────────────────

if (typeof require !== 'undefined' && require.main === module && process.argv.includes('--test')) {
  const NOW = Date.parse('2026-07-20T12:00:00Z');
  const FUT = '2026-08-18T15:00:00Z'; // ~29 días adelante

  // N fechas de un artista (música). ids y fechas distintos.
  const music = (artist, venue, genre, saleISO, n, cc = 'MX', presales = []) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${artist}-${i}`, name: artist, url: 'https://ticketmaster.com/x',
      dates: { start: { localDate: `2026-11-0${i + 1}` }, status: { code: 'onsale' } },
      _embedded: { venues: [{ name: venue, city: { name: 'x' }, country: { countryCode: cc } }], attractions: [{ name: artist }] },
      classifications: [{ segment: { name: 'Music' }, genre: { name: genre } }],
      sales: { public: { startDateTime: saleISO }, presales },
    }));

  // Un juego (deporte).
  const game = (name, venue, saleISO, cc = 'US', id = 'g1') => [{
    id, name, url: 'https://ticketmaster.com/g',
    dates: { start: { localDate: '2026-12-05' }, status: { code: 'onsale' } },
    _embedded: { venues: [{ name: venue, city: { name: 'x' }, country: { countryCode: cc } }], attractions: [{ name }] },
    classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Football' } }],
    sales: { public: { startDateTime: saleISO }, presales: [] },
  }];

  let pass = 0, fail = 0;
  const check = (l, c) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.log(`  ✗ ${l}`); } };

  console.log('\n1) Umbral: 7 fechas de pop en GNP (aunque no esté en la lista) sí alerta; 1 fecha no');
  let sd = {};
  // 7 fechas: pop30 + GNP30 + 7fechas20 = 80 ≥ 70 → alerta por score, sin estar en la lista.
  let out = run(music('Artista X', 'Estadio GNP Seguros', 'Pop', FUT, 7), sd, NOW);
  check('7 fechas de pop en estadio (score 80) → alerta', out.length === 1);
  // 1 fecha: pop30 + GNP30 = 60 < 70 → no alerta.
  sd = {};
  out = run(music('Artista Y', 'Estadio GNP Seguros', 'Pop', FUT, 1), sd, NOW);
  check('1 fecha de pop (score 60) → no alerta', out.length === 0);

  console.log('\n2) Artista de la lista → WISHLIST (gira agrupada: 1 aviso con las fechas)');
  sd = {};
  out = run(music('Shakira', 'Estadio GNP Seguros', 'Latin', FUT, 3, 'MX'), sd, NOW);
  check('1 alerta (3 fechas, misma venta → deduplicada)', out.length === 1);
  check('kind WISHLIST', out[0]?.json.kind === 'WISHLIST');
  check('el texto dice "3 fechas"', /3 fechas/.test(out[0]?.json.text ?? ''));
  check('marcado como música', out[0]?.json.segment === 'Music');

  console.log('\n3) Artista de EU en la lista → bandera US');
  sd = {};
  out = run(music('Billie Eilish', 'SoFi Stadium', 'Pop', FUT, 2, 'US'), sd, NOW);
  check('1 alerta (2 fechas agrupadas)', out.length === 1);
  check('país US', out[0]?.json.country === 'US');
  check('texto trae 🇺🇸', /🇺🇸/.test(out[0]?.json.text ?? ''));

  console.log('\n4) Venta ya pasada, sin goteo futuro → nada');
  sd = {};
  out = run(music('Shakira', 'Estadio GNP Seguros', 'Latin', '2026-01-10T17:00:00Z', 3, 'MX'), sd, NOW);
  check('cero alertas', out.length === 0);

  console.log('\n5) Deportes: choque de 2 grandes → WISHLIST');
  sd = {};
  out = run(game('Dallas Cowboys vs Philadelphia Eagles', 'AT&T Stadium', FUT, 'US'), sd, NOW);
  check('alerta', out.length === 1);
  check('marcado como deporte', out[0]?.json.segment === 'Sports');
  check('kind WISHLIST', out[0]?.json.kind === 'WISHLIST');

  console.log('\n6) Partido de temporada regular (1 solo equipo grande) → NO alerta');
  sd = {};
  out = run(game('Dallas Cowboys vs Arizona Cardinals', 'AT&T Stadium', FUT, 'US', 'reg'), sd, NOW);
  check('un solo equipo grande, sin playoff → no alerta', out.length === 0);

  console.log('\n7) Playoff/Final → WISHLIST');
  sd = {};
  out = run(game('NBA Finals: Lakers vs Pacers', 'Crypto.com Arena', FUT, 'US'), sd, NOW);
  check('final califica', out.length === 1);
  check('kind WISHLIST', out[0]?.json.kind === 'WISHLIST');

  console.log('\n8) Box marquee (Canelo) → sí alerta; equipo chico → no');
  sd = {};
  const canelo = [{ id: 'cx', name: 'Canelo Alvarez vs Rival', url: 'u',
    dates: { start: { localDate: '2026-12-05' } },
    _embedded: { venues: [{ name: 'T-Mobile Arena', city: { name: 'x' }, country: { countryCode: 'US' } }], attractions: [{ name: 'Canelo Alvarez' }] },
    classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Boxing' } }],
    sales: { public: { startDateTime: FUT }, presales: [] } }];
  check('Canelo (box) alerta', run(canelo, {}, NOW).length === 1);
  out = run(game('Sacramento Kings vs Hornets', 'Small Arena', FUT, 'US', 'gz'), {}, NOW);
  check('equipo chico → no alerta', out.length === 0);

  console.log('\n9) Dedup: mismo juego llega por 2 búsquedas → 1 sola alerta');
  sd = {};
  out = run([].concat(
    game('Dallas Cowboys vs Philadelphia Eagles', 'AT&T Stadium', FUT, 'US', 'same'),
    game('Dallas Cowboys vs Philadelphia Eagles', 'AT&T Stadium', FUT, 'US', 'same'),
  ), sd, NOW);
  check('1 alerta (dedupeada por id)', out.length === 1);

  console.log('\n10) Recordatorios (modo normal, artista fuera de lista con score alto)');
  sd = {};
  // "Banda Grande" NO está en MUSIC → modo normal. 3 fechas pop en GNP = score 80 ≥ 70.
  const banda = () => music('Banda Grande', 'Estadio GNP Seguros', 'Pop', FUT, 3, 'MX');
  run(banda(), sd, Date.parse('2026-07-05T12:00:00Z'));             // NUEVO
  out = run(banda(), sd, Date.parse('2026-08-16T15:00:00Z'));       // 48 h
  check('llega RECORDATORIO', out.some((o) => /RECORDATORIO/.test(o.json.text)));
  out = run(banda(), sd, Date.parse('2026-08-18T13:30:00Z'));       // 1.5 h
  check('llega ÚLTIMA LLAMADA', out.some((o) => /ÚLTIMA LLAMADA/.test(o.json.text)));
  out = run(banda(), sd, Date.parse('2026-08-18T13:45:00Z'));
  check('no repite', out.length === 0);

  console.log('\n11) waParams cumple reglas de Meta (wishlist música y deporte)');
  const wm = run(music('Shakira', 'Estadio GNP Seguros', 'Latin', FUT, 3, 'MX'), {}, NOW)[0]?.json.waParams;
  const ws = run(game('Dallas Cowboys vs Eagles', 'AT&T Stadium', FUT, 'US'), {}, NOW)[0]?.json.waParams;
  check('música: 6 vars sin saltos', Array.isArray(wm) && wm.length === 6 && wm.every((p) => !/[\n\r]/.test(p)));
  check('deporte: 6 vars sin saltos', Array.isArray(ws) && ws.length === 6 && ws.every((p) => !/[\n\r]/.test(p)));

  console.log('\n12) Falsos positivos reportados por el usuario');
  // (a) Tributo NO es el artista real.
  sd = {};
  out = run(music('A Tribute to Taylor Swift', 'Estadio GNP Seguros', 'Pop', FUT, 3, 'US'), sd, NOW);
  check('(a) tributo a Taylor Swift → NO alerta', out.length === 0);
  // (b) "Drake White" (country) NO es Drake el rapero.
  sd = {};
  out = run(music('Drake White', 'SoFi Stadium', 'Country', FUT, 2, 'US'), sd, NOW);
  check('(b) Drake White → NO alerta', out.length === 0);
  // (c) Drake sí (match exacto) → wishlist, 1 por fecha.
  sd = {};
  out = run(music('Drake', 'SoFi Stadium', 'Hip-Hop/Rap', FUT, 2, 'US'), sd, NOW);
  check('(c) Drake (exacto) → sí alerta (agrupado)', out.length === 1);
  // (d) Voleibol femenil de México → excluido por tipo de deporte.
  sd = {};
  const volley = [{ id: 'v1', name: 'Mexico Women National Volleyball', url: 'u',
    dates: { start: { localDate: '2026-12-05' } },
    _embedded: { venues: [{ name: 'Arena X', city: { name: 'x' }, country: { countryCode: 'MX' } }], attractions: [{ name: 'Mexico Women National Volleyball' }] },
    classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Volleyball' } }],
    sales: { public: { startDateTime: FUT }, presales: [] } }];
  out = run(volley, sd, NOW);
  check('(d) voleibol femenil → NO alerta', out.length === 0);

  console.log('\n13) Modo normal: goteo sobre show agotado → NO alerta (artista fuera de lista)');
  sd = {};
  out = run(music('Banda Grande', 'Estadio GNP Seguros', 'Pop', '2026-03-01T15:00:00Z', 3, 'US', [
    { name: 'Limited Production Release', startDateTime: '2026-07-25T19:00:00Z' },
  ]), sd, NOW);
  check('goteo sobre agotado (fuera de lista) → NO alerta', out.length === 0);

  console.log('\n14) Modo normal: venta futura + fan presale → 1 alerta, ancla en la preventa');
  sd = {};
  out = run(music('Banda Grande', 'Estadio GNP Seguros', 'Pop', '2026-08-25T15:00:00Z', 2, 'MX', [
    { name: 'Fan Presale', startDateTime: '2026-08-23T15:00:00Z' },
  ]), sd, NOW);
  check('sí alerta', out.length === 1);
  check('la ventana más cercana es la preventa', /Fan Presale/.test(out[0]?.json.text ?? ''));

  console.log('\n15) WISHLIST: goteo sobre show agotado SÍ alerta (con checklist de reventa)');
  sd = {};
  const wishDrip = [{ id: 'bts-metlife-w', name: 'BTS World Tour Arirang', url: 'https://tm.com/bts',
    dates: { start: { localDate: '2026-08-01' } },
    _embedded: { venues: [{ name: 'MetLife Stadium', city: { name: 'East Rutherford' }, country: { countryCode: 'US' } }], attractions: [{ name: 'BTS' }] },
    classifications: [{ segment: { name: 'Music' }, genre: { name: 'Pop' } }],
    sales: {
      public: { startDateTime: '2026-03-01T15:00:00Z' },
      presales: [{ name: 'Limited Production Release', startDateTime: '2026-07-25T19:00:00Z' }],
    } }];
  out = run(wishDrip, sd, NOW);
  check('el goteo SÍ dispara alerta WISHLIST', out.length === 1 && out[0].json.kind === 'WISHLIST');
  check('menciona el production release', /Limited Production Release/.test(out[0]?.json.text ?? ''));
  check('trae el checklist de reventa', /Checklist reventa/i.test(out[0]?.json.text ?? '') && /transferible/i.test(out[0]?.json.text ?? ''));
  out = run(wishDrip, sd, NOW);
  check('no repite el mismo goteo', out.length === 0);
  wishDrip[0].sales.presales.push({ name: 'Verified Resale', startDateTime: '2026-07-28T19:00:00Z' });
  out = run(wishDrip, sd, NOW);
  check('un goteo nuevo sí dispara', out.length === 1);

  console.log('\n16) Artista fuera de lista y sin score → nunca alerta (ni con goteo)');
  sd = {};
  out = run(music('Banda Chica', 'Bar Chico', 'Folk', '2026-03-01T15:00:00Z', 1, 'US', [
    { name: 'Limited Production Release', startDateTime: '2026-07-25T19:00:00Z' },
  ]), sd, NOW);
  check('artista chico (fuera de lista, sin score) → nunca alerta', out.length === 0);

  console.log('\n17) WISHLIST deportes: playoff caza goteos; temporada regular no');
  sd = {};
  const finalDrip = [{ id: 'nbafinals', name: 'NBA Finals Game 7', url: 'https://tm.com/finals',
    dates: { start: { localDate: '2026-06-20' } },
    _embedded: { venues: [{ name: 'Crypto.com Arena', city: { name: 'LA' }, country: { countryCode: 'US' } }], attractions: [{ name: 'NBA Finals' }] },
    classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Basketball' } }],
    sales: { public: { startDateTime: '2026-01-01T15:00:00Z' }, presales: [{ name: 'Limited Production Release', startDateTime: '2026-07-25T19:00:00Z' }] } }];
  out = run(finalDrip, sd, NOW);
  check('final deportiva agotada → caza el goteo (WISHLIST)', out.length === 1 && out[0].json.kind === 'WISHLIST');
  sd = {};
  const regular = [{ id: 'reg2', name: 'Los Angeles Lakers vs Kings', url: 'u',
    dates: { start: { localDate: '2026-11-20' } },
    _embedded: { venues: [{ name: 'Crypto.com Arena', city: { name: 'LA' }, country: { countryCode: 'US' } }], attractions: [{ name: 'Los Angeles Lakers' }] },
    classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Basketball' } }],
    sales: { public: { startDateTime: '2026-01-01T15:00:00Z' }, presales: [{ name: 'Limited Production Release', startDateTime: '2026-07-25T19:00:00Z' }] } }];
  out = run(regular, sd, NOW);
  check('temporada regular agotada → NO caza goteo', out.length === 0);

  console.log('\n18) Géneros nuevos: F1 y lucha (evento individual, 1 token) → WISHLIST');
  sd = {};
  const f1 = [{ id: 'f1mx', name: 'Formula 1 Gran Premio de Mexico', url: 'u',
    dates: { start: { localDate: '2026-10-25' } },
    _embedded: { venues: [{ name: 'Autodromo', city: { name: 'CDMX' }, country: { countryCode: 'MX' } }], attractions: [{ name: 'Formula 1' }] },
    classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Motorsports/Racing' } }],
    sales: { public: { startDateTime: FUT }, presales: [] } }];
  out = run(f1, sd, NOW);
  check('F1 México → alerta WISHLIST', out.length === 1 && out[0].json.kind === 'WISHLIST');
  sd = {};
  const wm2 = [{ id: 'wm', name: 'WWE WrestleMania', url: 'u',
    dates: { start: { localDate: '2026-04-05' } },
    _embedded: { venues: [{ name: 'SoFi Stadium', city: { name: 'LA' }, country: { countryCode: 'US' } }], attractions: [{ name: 'WrestleMania' }] },
    classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Wrestling' } }],
    sales: { public: { startDateTime: FUT }, presales: [] } }];
  out = run(wm2, sd, NOW);
  check('WrestleMania → alerta WISHLIST', out.length === 1 && out[0].json.kind === 'WISHLIST');
  sd = {};
  const race = [{ id: 'r', name: 'Some Local Race', url: 'u',
    dates: { start: { localDate: '2026-10-25' } },
    _embedded: { venues: [{ name: 'Track', city: { name: 'x' }, country: { countryCode: 'US' } }], attractions: [{ name: 'Local Race' }] },
    classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Racing' } }],
    sales: { public: { startDateTime: FUT }, presales: [] } }];
  out = run(race, sd, NOW);
  check('carrera sin marquee → NO alerta', out.length === 0);

  console.log('\n19) Pretemporada: Warriors vs Lakers (2 grandes) pero PRESEASON → NO alerta');
  sd = {};
  // El "preseason" viene en el nombre de la preventa, no del evento (caso real).
  const preseason = [{ id: 'gsw-pre', name: 'Golden State Warriors vs Los Angeles Lakers', url: 'u',
    dates: { start: { localDate: '2026-10-06' } },
    _embedded: { venues: [{ name: 'Chase Center', city: { name: 'SF' }, country: { countryCode: 'US' } }], attractions: [{ name: 'Golden State Warriors' }] },
    classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Basketball' } }],
    sales: { public: { startDateTime: FUT }, presales: [{ name: 'Golden State VIP Member Individual Preseason Ticket Presale', startDateTime: FUT }] } }];
  out = run(preseason, sd, NOW);
  check('choque de 2 grandes en pretemporada → NO alerta', out.length === 0);
  // Control: el mismo choque en temporada regular SÍ alerta.
  sd = {};
  out = run(game('Golden State Warriors vs Los Angeles Lakers', 'Chase Center', FUT, 'US', 'gsw-reg'), sd, NOW);
  check('el mismo choque (sin pretemporada) SÍ alerta', out.length === 1);

  console.log('\n20) Inter Miami (efecto Messi): califica aunque el rival sea chico');
  sd = {};
  // Visita: rival chico vs Inter Miami. Solo 1 marquee, pero SOLO_MARQUEE → califica.
  const messi = [{ id: 'im', name: 'Nashville SC vs Inter Miami CF', url: 'u',
    dates: { start: { localDate: '2026-09-01' } },
    _embedded: { venues: [{ name: 'Geodis Park', city: { name: 'Nashville' }, country: { countryCode: 'US' } }], attractions: [{ name: 'Inter Miami CF' }] },
    classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Soccer' } }],
    sales: { public: { startDateTime: FUT }, presales: [] } }];
  out = run(messi, sd, NOW);
  check('Inter Miami vs equipo chico → SÍ alerta', out.length === 1);
  // Control: dos equipos chicos de MLS → NO alerta.
  sd = {};
  out = run([{ id: 'x2', name: 'Nashville SC vs Austin FC', url: 'u',
    dates: { start: { localDate: '2026-09-01' } },
    _embedded: { venues: [{ name: 'Geodis Park', city: { name: 'x' }, country: { countryCode: 'US' } }], attractions: [{ name: 'Nashville SC' }] },
    classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Soccer' } }],
    sales: { public: { startDateTime: FUT }, presales: [] } }], sd, NOW);
  check('2 equipos chicos → NO alerta', out.length === 0);

  console.log('\n21) Selección Mexicana: se agota sin importar rival (solo-marquee)');
  sd = {};
  const seleccion = [{ id: 'sel', name: 'Mexico National Team vs Honduras', url: 'u',
    dates: { start: { localDate: '2026-10-10' } },
    _embedded: { venues: [{ name: 'Estadio Banorte', city: { name: 'x' }, country: { countryCode: 'US' } }], attractions: [{ name: 'Mexico National Team' }] },
    classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Soccer' } }],
    sales: { public: { startDateTime: FUT }, presales: [] } }];
  out = run(seleccion, sd, NOW);
  check('México vs rival chico → SÍ alerta', out.length === 1);
  // Control: "New Mexico United" (equipo real de USL) NO debe colarse.
  sd = {};
  out = run([{ id: 'nm', name: 'New Mexico United vs Phoenix', url: 'u',
    dates: { start: { localDate: '2026-10-10' } },
    _embedded: { venues: [{ name: 'Field', city: { name: 'x' }, country: { countryCode: 'US' } }], attractions: [{ name: 'New Mexico United' }] },
    classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Soccer' } }],
    sales: { public: { startDateTime: FUT }, presales: [] } }], sd, NOW);
  check('New Mexico United → NO se cuela', out.length === 0);

  console.log('\n22) Wishlist: recordatorio a ≤24 h para no olvidar (aparte del aviso inicial)');
  sd = {};
  const sale = '2026-08-15T15:00:00Z';
  const im = () => [{ id: 'imcf', name: 'Inter Miami CF vs Cruz Azul', url: 'u',
    dates: { start: { localDate: '2026-09-16' } },
    _embedded: { venues: [{ name: 'Nu Stadium', city: { name: 'Miami' }, country: { countryCode: 'US' } }], attractions: [{ name: 'Inter Miami CF' }] },
    classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Soccer' } }],
    sales: { public: { startDateTime: sale }, presales: [] } }];
  // Descubierto con la venta a ~10 días → aviso inicial WISHLIST.
  out = run(im(), sd, Date.parse('2026-08-05T15:00:00Z'));
  check('aviso inicial (WISHLIST)', out.some((o) => o.json.kind === 'WISHLIST'));
  // Ya a ~20 h → llega RECORDATORIO.
  out = run(im(), sd, Date.parse('2026-08-14T19:00:00Z'));
  check('recordatorio ≤24 h', out.some((o) => /RECORDATORIO/.test(o.json.text)));
  // Otra corrida igual → no repite.
  out = run(im(), sd, Date.parse('2026-08-14T20:00:00Z'));
  check('no repite el de 24 h', out.length === 0);
  // A ~1 h → última llamada.
  out = run(im(), sd, Date.parse('2026-08-15T14:00:00Z'));
  check('última llamada ≤2 h', out.some((o) => /ÚLTIMA LLAMADA/.test(o.json.text)));

  console.log('\n22b) NFL en México (49ers vs Vikings en Azteca) → SÍ alerta');
  sd = {};
  const nfl = [{ id: 'nflmx', name: 'San Francisco 49ers vs Minnesota Vikings', url: 'u',
    dates: { start: { localDate: '2026-11-15' } },
    _embedded: { venues: [{ name: 'Estadio Banorte', city: { name: 'CDMX' }, country: { countryCode: 'MX' } }], attractions: [{ name: 'San Francisco 49ers' }] },
    classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Football' } }],
    sales: { public: { startDateTime: FUT }, presales: [] } }];
  check('NFL en México → alerta', run(nfl, sd, NOW).length === 1);
  // Control: NFL en EU con 1 solo equipo grande NO alerta (temporada regular).
  sd = {};
  const nflUs = [{ id: 'nflus', name: 'San Francisco 49ers vs Arizona Cardinals', url: 'u',
    dates: { start: { localDate: '2026-11-15' } },
    _embedded: { venues: [{ name: 'Levi Stadium', city: { name: 'x' }, country: { countryCode: 'US' } }], attractions: [{ name: 'San Francisco 49ers' }] },
    classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Football' } }],
    sales: { public: { startDateTime: FUT }, presales: [] } }];
  check('49ers vs equipo chico en EU → NO alerta', run(nflUs, sd, NOW).length === 0);
  // NBA en México → alerta; liga mexicana (sin NBA/marquee) → no.
  sd = {};
  const nba = [{ id: 'nbamx', name: 'NBA Mexico City Game: Pistons vs Mavericks', url: 'u',
    dates: { start: { localDate: '2026-11-01' } },
    _embedded: { venues: [{ name: 'Arena CDMX', city: { name: 'CDMX' }, country: { countryCode: 'MX' } }], attractions: [{ name: 'NBA' }] },
    classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Basketball' } }],
    sales: { public: { startDateTime: FUT }, presales: [] } }];
  check('NBA en México → alerta', run(nba, {}, NOW).length === 1);
  const lnbp = [{ id: 'lnbp', name: 'Fuerza Regia vs Astros de Jalisco', url: 'u',
    dates: { start: { localDate: '2026-11-01' } },
    _embedded: { venues: [{ name: 'Gimnasio X', city: { name: 'x' }, country: { countryCode: 'MX' } }], attractions: [{ name: 'Fuerza Regia' }] },
    classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Basketball' } }],
    sales: { public: { startDateTime: FUT }, presales: [] } }];
  check('liga mexicana (LNBP) → NO se cuela', run(lnbp, {}, NOW).length === 0);

  console.log('\n23) Anti-ruido: gira de 6 ciudades con misma venta → 1 aviso, no 6');
  sd = {};
  const gira = Array.from({ length: 6 }, (_, i) => ({
    id: `fr-${i}`, name: 'Fuerza Regida', url: 'u',
    dates: { start: { localDate: `2026-10-0${i + 1}` } },
    _embedded: { venues: [{ name: `Anfiteatro ${i}`, city: { name: `Ciudad ${i}` }, country: { countryCode: 'US' } }], attractions: [{ name: 'Fuerza Regida' }] },
    classifications: [{ segment: { name: 'Music' }, genre: { name: 'Latin' } }],
    sales: { public: { startDateTime: FUT }, presales: [] } }));
  out = run(gira, sd, NOW);
  check('6 fechas misma venta → 1 sola alerta', out.length === 1);
  check('el texto dice "6 fechas"', /6 fechas/.test(out[0]?.json.text ?? ''));

  console.log('\n24) Basura → no revienta');
  out = run([{ id: 'x' }, {}, null], {}, NOW);
  check('sobrevive', Array.isArray(out));

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} pass, ${fail} fail\n`);
  if (fail) process.exit(1);
}

/**
 * Genera la lista de búsquedas a Ticketmaster (una por artista/equipo × país +
 * una general de MX). Misma lógica que usaba el nodo Fuentes de n8n.
 */
function buildSearches() {
  const s = [{ label: 'MX:todos', qs: { countryCode: 'MX', size: '200', sort: 'date,asc' } }];
  const seenKeys = new Set();
  const add = (cc, kw) => {
    const key = `${cc}:${kw}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    s.push({ label: key, qs: { countryCode: cc, keyword: kw, size: '50', sort: 'date,asc' } });
  };
  for (const list of [MUSIC, SPORTS, WISHLIST_SPORTS_SEARCH]) {
    for (const item of list) for (const cc of item.cc) add(cc, item.kw);
  }
  return s;
}

if (typeof module !== 'undefined') {
  module.exports = { normalize, score, detect, formatAlert, waParams, run, buildSearches, isWishlist, MUSIC, SPORTS, WISHLIST_SPORTS_SEARCH };
}
