const fs = require('node:fs');
const file = 'ganhonasodds_com_20261101.csv';
const input = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const firstLine = input.split(/\r?\n/, 1)[0];
const candidates = [',', ';', '\t'];
const delimiter = candidates.sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
function parseCSV(text, sep) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false; else field += c;
    } else if (c === '"' && field.length === 0) quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
const rows = parseCSV(input, delimiter).filter(r => r.some(v => String(v).trim() !== ''));
if (!rows.length) throw new Error('CSV vazio ou ilegível');
const headers = rows[0].map((h, i) => (h || ('coluna_' + (i+1))).trim());
const data = rows.slice(1).filter(r => r.some(v => String(v).trim() !== ''));
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
const find = patterns => headers.map((h, i) => ({h, i, n:norm(h)})).filter(x => patterns.some(p => x.n.includes(p)));
const groups = {
 date:find(['date','matchdate','gamedate']), league:find(['league','competition','div','tournament']),
 season:find(['season','year']), home:find(['hometeam','home','teamhome']), away:find(['awayteam','away','teamaway']),
 homeGoals:find(['fthg','homegoals','hg','homescore']), awayGoals:find(['ftag','awaygoals','ag','awayscore']),
 homeCorners:find(['homecorners','cornershome','hc']), awayCorners:find(['awaycorners','cornersaway','ac']),
 homeShots:find(['homeshots','shotshome','hst']), awayShots:find(['awayshots','shotsaway','ast']),
 homeTarget:find(['homeshotsontarget','hshotsontarget','soth']), awayTarget:find(['awayshotsontarget','ashotsontarget','sota']),
 homeFouls:find(['homefouls','foulshome','hf']), awayFouls:find(['awayfouls','foulsaway','af'])
};
const stats = headers.map((h, i) => {
 let nonempty = 0; for (const r of data) if (String(r[i] ?? '').trim() !== '') nonempty++;
 return {header:h, nonempty, missing:data.length-nonempty};
});
const dateCol = groups.date[0]?.i;
const dates = dateCol == null ? [] : data.map(r => r[dateCol]).filter(Boolean).sort();
const distinct = key => {
 const col = groups[key][0]?.i;
 return col == null ? [] : [...new Set(data.map(r => (r[col] || '').trim()).filter(Boolean))].sort();
};
const report = [
 '# Auditoria do CSV de Odds','',
 '- Ficheiro: ' + file,
 '- Tamanho: ' + fs.statSync(file).size + ' bytes',
 '- Delimitador detetado: ' + (delimiter === '\t' ? 'TAB' : delimiter),
 '- Linhas de dados: ' + data.length,
 '- Colunas: ' + headers.length,
 '- Datas: ' + (dates[0] || 'não identificadas') + ' — ' + (dates.at(-1) || 'não identificadas'),
 '- Competições distintas: ' + distinct('league').length,
 ...distinct('league').map(x => '  - ' + x),'',
 '## Cabeçalhos', ...headers.map((h,i) => '- ' + (i+1) + '. ' + h),'',
 '## Completude por coluna','| Coluna | Preenchidos | Vazios |','|---|---:|---:|',
 ...stats.map(s => '| ' + s.header.replace(/\|/g,'/') + ' | ' + s.nonempty + ' | ' + s.missing + ' |'),'',
 '## Campos reconhecidos (candidatos; confirmar semântica)',
 ...Object.entries(groups).map(([k,v]) => '- ' + k + ': ' + (v.map(x=>x.h).join(', ') || 'não encontrado')),'',
 'Nota: este relatório não importa nem utiliza odds nas previsões do simulador. Os nomes das colunas são apenas candidatos; a semântica e a licença da fonte devem ser confirmadas antes de qualquer integração.'
].join('\n');
fs.writeFileSync('csv-odds-audit.md', report);
console.log(report);
