/**
 * Runner del Ticket Radar para GitHub Actions (o cualquier cron / Node).
 *
 * Hace lo mismo que hacía el workflow de n8n, pero en un solo script:
 *   1. Busca en la Ticketmaster Discovery API (todas las fuentes).
 *   2. Corre el motor (radar.js) para detectar alertas.
 *   3. Manda cada alerta a Telegram.
 *   4. Guarda el snapshot en snapshot.json (GitHub Actions lo commitea para que
 *      la próxima corrida solo avise lo NUEVO).
 *
 * Uso:
 *   node run-radar.js             (usa las variables de entorno / secrets)
 *   DRY_RUN=1 node run-radar.js   (prueba sin red ni envíos)
 *
 * Env vars (secrets en GitHub):
 *   TICKETMASTER_API_KEY, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID,
 *   (WhatsApp se quitó: CallMeBot no entrega desde servidores. Solo Telegram.)
 */

const fs = require('fs');
const path = require('path');
const radar = require('./radar.js');

const {
  TICKETMASTER_API_KEY, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, DRY_RUN,
} = process.env;

const SNAPSHOT = path.join(__dirname, 'snapshot.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchSearch(qs) {
  const url = 'https://app.ticketmaster.com/discovery/v2/events.json?' +
    new URLSearchParams({ apikey: TICKETMASTER_API_KEY, ...qs }).toString();
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const body = await res.json();
    return body?._embedded?.events ?? [];
  } catch {
    return [];
  }
}

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) { console.log('TG: faltan secrets'); return; }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    });
    console.log(`TG status ${res.status}`);
  } catch (e) { console.log('TG error:', e.message); }
}

async function main() {
  // Modo prueba: manda un mensaje a Telegram para confirmar que entrega.
  if (process.env.TEST_NOTIFY === 'true' || process.env.TEST_NOTIFY === '1') {
    console.log('== PRUEBA DE NOTIFICACIÓN ==');
    await sendTelegram('✅ Prueba Ticket Radar desde GitHub');
    console.log('Prueba enviada. Revisa Telegram.');
    return;
  }

  const firstRun = !fs.existsSync(SNAPSHOT);
  let staticData = {};
  if (!firstRun) {
    try { staticData = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')); } catch { staticData = {}; }
  }

  const searches = radar.buildSearches();
  console.log(`🔎 ${searches.length} fuentes a buscar${DRY_RUN ? ' (DRY RUN)' : ''}`);

  let rawEvents = [];
  if (DRY_RUN) {
    rawEvents = [{
      id: 'demo', name: 'BTS Demo', url: 'https://tm.com/demo',
      _embedded: { venues: [{ name: 'Estadio GNP Seguros', city: { name: 'CDMX' }, country: { countryCode: 'MX' } }], attractions: [{ name: 'BTS' }] },
      classifications: [{ segment: { name: 'Music' }, genre: { name: 'Pop' } }],
      dates: { start: { localDate: '2026-12-01' } },
      sales: { public: { startDateTime: '2026-03-01T15:00:00Z' }, presales: [{ name: 'Limited Production Release', startDateTime: '2027-01-15T15:00:00Z' }] } },
    ];
  } else {
    for (const s of searches) {
      const events = await fetchSearch(s.qs);
      rawEvents.push(...events);
      await sleep(230); // < 5 req/seg (rate limit de la Discovery API)
    }
  }
  console.log(`📦 ${rawEvents.length} eventos recibidos`);

  const alerts = radar.run(rawEvents, staticData, Date.now());

  if (firstRun) {
    // Primera corrida: sembramos el snapshot sin enviar (evita el alud inicial
    // de decenas de mensajes). De aquí en adelante solo llega lo NUEVO.
    console.log(`🌱 Primera corrida: snapshot sembrado, ${alerts.length} alertas SILENCIADAS.`);
  } else {
    console.log(`📨 ${alerts.length} alertas para enviar`);
    for (const a of alerts) {
      await sendTelegram(a.json.text);
      await sleep(600); // margen para el rate limit de Telegram
    }
  }

  fs.writeFileSync(SNAPSHOT, JSON.stringify(staticData));
  console.log('💾 Snapshot guardado');
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
