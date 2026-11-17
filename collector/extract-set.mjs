// Community Dragon ko_kr.json 에서 한 세트의 기물/시너지만 뽑아 data/set<N>.json 으로 저장한다.
// 원본 받기: https://raw.communitydragon.org/latest/cdragon/tft/ko_kr.json → data/cdragon-raw/ko_kr.json
// 실행: node collector/extract-set.mjs 18
import fs from 'node:fs';

const SET = Number(process.argv[2] ?? 18);
const raw = JSON.parse(fs.readFileSync('data/cdragon-raw/ko_kr.json', 'utf8'));
const set = raw.setData.find(s => s.mutator === `TFTSet${SET}`);
if (!set) throw new Error(`TFTSet${SET} 없음`);

const icon = p => p && 'https://raw.communitydragon.org/latest/game/' + p.toLowerCase().replace(/\.(tex|dds)$/, '.png');

const champions = set.champions
  .filter(c => c.cost >= 1 && c.cost <= 6 && c.traits?.length)
  .map(c => ({ id: c.apiName, name: c.name, cost: c.cost, traits: c.traits, icon: icon(c.squareIcon || c.tileIcon) }));

const traits = set.traits.map(t => ({
  id: t.apiName,
  name: t.name,
  icon: icon(t.icon),
  breakpoints: (t.effects ?? []).map(e => ({ min: e.minUnits, max: e.maxUnits, style: e.style })),
}));

fs.writeFileSync(`data/set${SET}.json`, JSON.stringify({ set: SET, champions, traits }, null, 1));
console.log(`set ${SET}: 기물 ${champions.length}개 (전체 ${set.champions.length}), 시너지 ${traits.length}개`);
