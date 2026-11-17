// 라이엇 TFT API에서 상위 랭커(KR) 랭크 게임을 모아 data/matches.jsonl 에 쌓는다.
// 실행: node collector/collect.mjs   (프로젝트 루트에서)
// 다시 실행하면 이미 받은 게임/유저는 건너뛰고 이어서 받는다.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const DATA = path.join(ROOT, 'data');
const MATCHES_FILE = path.join(DATA, 'matches.jsonl');
const STATE_FILE = path.join(DATA, 'collect-state.json');
const PLAYERS_FILE = path.join(DATA, 'players.json');

// config.json 의 patchStart 이후 게임만 받는다 (API 응답의 패치 버전이 가려져 있어서 날짜로 거른다)
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const START_TIME = Math.floor(new Date(`${CONFIG.patchStart}T00:00:00+09:00`).getTime() / 1000);

const MATCHES_PER_PLAYER = 20;
const RANKED_QUEUE = 1100;
// 개발 키 한도: 1초 20회, 2분 100회 → 1.25초 간격이면 2분에 96회
const REQUEST_GAP_MS = 1250;

function readKey() {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const m = env.match(/RIOT_API_KEY=(RGAPI-[0-9a-fA-F-]+)/);
  if (!m) throw new Error('.env 에 RIOT_API_KEY 가 없습니다');
  return m[1];
}

const KEY = readKey();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let lastRequest = 0;

class KeyError extends Error {}

async function riot(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = lastRequest + REQUEST_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();

    let res;
    try {
      res = await fetch(url, { headers: { 'X-Riot-Token': KEY } });
    } catch (e) {
      console.warn(`  네트워크 오류, 재시도: ${e.message}`);
      await sleep(5000);
      continue;
    }
    if (res.ok) return res.json();
    if (res.status === 401 || res.status === 403) {
      throw new KeyError(`API 키 거부됨 (${res.status}). 키가 만료됐을 수 있습니다.`);
    }
    if (res.status === 404) return null;
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') || 10);
      console.warn(`  요청 한도 초과, ${retry}초 대기`);
      await sleep(retry * 1000);
      continue;
    }
    console.warn(`  HTTP ${res.status}, 재시도`);
    await sleep(3000);
  }
  return null;
}

// 원본 게임 데이터에서 추천에 필요한 것만 남긴다
function compact(match) {
  const i = match.info;
  return {
    id: match.metadata.match_id,
    datetime: i.game_datetime,
    version: i.game_version,
    set: i.tft_set_number,
    setCore: i.tft_set_core_name,
    queue: i.queue_id,
    participants: i.participants.map(p => ({
      puuid: p.puuid,
      placement: p.placement,
      level: p.level,
      lastRound: p.last_round,
      goldLeft: p.gold_left,
      augments: p.augments ?? [],
      units: p.units.map(u => ({ id: u.character_id, tier: u.tier, rarity: u.rarity, items: u.itemNames ?? [] })),
      traits: p.traits
        .filter(t => t.tier_current > 0)
        .map(t => ({ name: t.name, units: t.num_units, tier: t.tier_current, style: t.style })),
    })),
  };
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  return { donePlayers: [], skippedMatches: [] };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

function loadSavedMatchIds() {
  const ids = new Set();
  if (!fs.existsSync(MATCHES_FILE)) return ids;
  for (const line of fs.readFileSync(MATCHES_FILE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      ids.add(JSON.parse(line).id);
    } catch {
      // 중간에 멈춰서 잘린 마지막 줄은 무시 (그 게임은 다시 받는다)
    }
  }
  return ids;
}

async function loadPlayers() {
  if (fs.existsSync(PLAYERS_FILE)) return JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
  const players = [];
  for (const tier of ['challenger', 'grandmaster', 'master']) {
    const league = await riot(`https://kr.api.riotgames.com/tft/league/v1/${tier}?queue=RANKED_TFT`);
    const entries = (league?.entries ?? []).sort((a, b) => b.leaguePoints - a.leaguePoints);
    console.log(`${tier}: ${entries.length}명`);
    for (const e of entries) players.push({ puuid: e.puuid, tier, lp: e.leaguePoints, wins: e.wins, losses: e.losses });
  }
  fs.writeFileSync(PLAYERS_FILE, JSON.stringify(players, null, 1));
  return players;
}

async function main() {
  fs.mkdirSync(DATA, { recursive: true });
  const state = loadState();
  const donePlayers = new Set(state.donePlayers);
  const skipped = new Set(state.skippedMatches);
  const saved = loadSavedMatchIds();
  const players = await loadPlayers();
  console.log(`유저 ${players.length}명 중 ${donePlayers.size}명 완료, 저장된 게임 ${saved.size}판`);

  const out = fs.createWriteStream(MATCHES_FILE, { flags: 'a' });
  let n = 0;
  try {
    for (const player of players) {
      if (donePlayers.has(player.puuid)) continue;
      n++;
      const ids = await riot(
        `https://asia.api.riotgames.com/tft/match/v1/matches/by-puuid/${player.puuid}/ids?count=${MATCHES_PER_PLAYER}&startTime=${START_TIME}`,
      ) ?? [];
      const fresh = ids.filter(id => !saved.has(id) && !skipped.has(id));
      for (const id of fresh) {
        const match = await riot(`https://asia.api.riotgames.com/tft/match/v1/matches/${id}`);
        if (!match || match.info.queue_id !== RANKED_QUEUE || match.info.tft_set_number !== CONFIG.set) {
          skipped.add(id);
          continue;
        }
        out.write(JSON.stringify(compact(match)) + '\n');
        saved.add(id);
      }
      donePlayers.add(player.puuid);
      state.donePlayers = [...donePlayers];
      state.skippedMatches = [...skipped];
      saveState(state);
      console.log(`[${donePlayers.size}/${players.length}] ${player.tier} ${player.lp}LP → 새 게임 ${fresh.length}개, 누적 ${saved.size}판`);
    }
    console.log('모든 유저 수집 완료');
  } catch (e) {
    if (e instanceof KeyError) console.error(e.message, '→ 새 키로 .env 를 바꾸고 다시 실행하세요.');
    else throw e;
  } finally {
    out.end();
    state.donePlayers = [...donePlayers];
    state.skippedMatches = [...skipped];
    saveState(state);
    console.log(`이번 실행 처리 유저 ${n}명, 총 저장 게임 ${saved.size}판`);
  }
}

main();
