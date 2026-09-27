// Собирает js/icons.js из пакета @tabler/icons (MIT). Запуск: node tools/build_icons.mjs <путь к @tabler/icons>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.argv[2] || 'node_modules/@tabler/icons';
const names = `sos mountain route map map-pin current-location first-aid-kit users user-check id-badge-2 shield-check shield-heart
phone phone-call message wifi wifi-off battery-2 battery-charging alert-triangle alert-octagon clock bell bell-ringing microphone
microphone-off walk bandage bug cloud-storm cloud-rain wind temperature snowflake sun droplet tent home toilet-paper heartbeat
compass navigation chevron-right chevron-left chevron-down x check plus minus settings user qrcode volume volume-off player-play
player-pause send share flame bone brain lungs activity arrow-up lock trash refresh cloud-download device-mobile-vibration
message-chatbot trees building-cottage bolt vaccine pill paw hand-stop sunset sunrise history backpack binoculars flag target
lifebuoy ambulance urgent info-circle circle-check thermometer umbrella eye copy moon cloud cloud-fog clock-exclamation
arrow-back-up heart run medical-cross dog`.split(/\s+/).filter(Boolean);

const out = {};
for (const n of names) {
  const svg = readFileSync(join(base, 'icons', 'outline', n + '.svg'), 'utf8');
  out[n] = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace('</svg>', '')
    .replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*\/>/, '')
    .replace(/\s*\n\s*/g, '')
    .trim();
}
writeFileSync('js/icons.js', `// Tabler Icons (MIT), tabler.io/icons. Сгенерировано tools/build_icons.mjs.\nexport const ICONS = ${JSON.stringify(out)};\n`);
console.log(Object.keys(out).length, 'icons');
