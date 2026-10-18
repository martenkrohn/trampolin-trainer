const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const formatSeconds = n => n.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:3});
export const formatTimestamp = value => new Date(value).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});
export function parseSeconds(raw) {
  const value=String(raw).trim().replace(',','.');
  if (!/^\d{1,6}(?:\.\d{1,3})?$/.test(value)) return null;
  const seconds=Number(value);
  return seconds > 0 && seconds <= 86400 ? seconds : null;
}
export function localTimestamp(value = new Date()) {
  const d=new Date(value),pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function parseLocalTimestamp(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d=new Date(value);
  return Number.isFinite(d.getTime()) && localTimestamp(d) === value ? d.toISOString() : null;
}
export function filterMeasurements(rows,range='all',now=new Date()) {
  const start=new Date(now);start.setDate(start.getDate()-Number(range));
  return rows.filter(m => range==='all' || Date.parse(m.measuredAt)>=start.getTime() && Date.parse(m.measuredAt)<=now.getTime()).sort((a,b)=>Date.parse(a.measuredAt)-Date.parse(b.measuredAt)||a.id.localeCompare(b.id));
}
export function chartGeometry(rows) {
  if (!rows.length) return null;
  const times=rows.map(r=>Date.parse(r.measuredAt)),values=rows.map(r=>r.seconds);
  const first=Math.min(...times),last=Math.max(...times),low=Math.min(...values),high=Math.max(...values);
  const padding=Math.max(.5,(high-low)*.15),min=Math.max(0,low-padding),max=high+padding;
  return {first,last,min,max,points:rows.map((r,i)=>({id:r.id,x:last===first ? 338 : 66+(times[i]-first)/(last-first)*548,y:220-(r.seconds-min)/(max-min)*190}))};
}
export function measurementForm(measurement = null) {
  return `<form data-form="jump-time" data-id="${esc(measurement?.id || '')}"><div class="field"><label for="jump-seconds">Dauer in Sekunden</label><input id="jump-seconds" name="seconds" inputmode="decimal" required maxlength="10" placeholder="Zum Beispiel: 18,45" value="${measurement ? esc(String(measurement.seconds).replace('.',',')) : ''}"></div><p class="subtle jump-auto-time">${measurement ? 'Messung vom' : 'Datum und Uhrzeit automatisch:'} <span>${esc(formatTimestamp(measurement?.measuredAt || new Date()))}</span></p><details class="custom-details" ${measurement ? 'open' : ''}><summary>Weitere Angaben</summary><div class="custom-details-fields"><div class="field"><label for="jump-datetime">Datum und Uhrzeit</label><input id="jump-datetime" type="datetime-local" name="measuredAt" required value="${esc(localTimestamp(measurement?.measuredAt || new Date()))}"></div><div class="field"><label for="jump-notes">Notiz (optional)</label><textarea id="jump-notes" name="notes" maxlength="2000" placeholder="Was möchtest du zur Messung festhalten?">${esc(measurement?.notes || '')}</textarea></div></div></details><p class="error-text" data-time-error role="alert"></p><button class="button" type="submit">${measurement ? 'Änderungen speichern' : 'Messung speichern'}</button></form>`;
}
function chart(rows,selectedId) {
  const g=chartGeometry(rows);
  if (!g) return '<p class="subtle">Für diesen Zeitraum sind noch keine Messungen vorhanden.</p>';
  const selected=rows.find(r=>r.id===selectedId)||rows.at(-1);
  const ticks=Array.from({length:5},(_,i)=>{const n=g.min+(g.max-g.min)*i/4,y=220-i*190/4;return `<line x1="66" y1="${y}" x2="614" y2="${y}" class="chart-grid"/><text x="56" y="${y+4}" text-anchor="end">${esc(formatSeconds(n))}</text>`;}).join('');
  const xLabel=n=>new Date(n).toLocaleString('de-DE',g.last-g.first<86400000 ? {hour:'2-digit',minute:'2-digit'} : {day:'2-digit',month:'2-digit',year:'2-digit'});
  return `<div class="jump-chart"><svg viewBox="0 0 650 275" role="group" aria-label="Verlauf der Dauer für 10 Strecksprünge in Sekunden"><text x="66" y="16">Sekunden</text>${ticks}<polyline points="${g.points.map(p=>`${p.x},${p.y}`).join(' ')}" class="chart-line"/>${g.points.map((p,i)=>`<g role="button" tabindex="0" data-action="time-point" data-id="${esc(p.id)}" aria-label="Messung ${esc(formatSeconds(rows[i].seconds))} Sekunden am ${esc(formatTimestamp(rows[i].measuredAt))}" aria-pressed="${p.id===selected.id}"><circle cx="${p.x}" cy="${p.y}" r="16" class="chart-hit"/><circle cx="${p.x}" cy="${p.y}" r="${p.id===selected.id ? 7 : 5}" class="chart-point ${p.id===selected.id ? 'selected' : ''}"/><title>${esc(formatSeconds(rows[i].seconds))} s · ${esc(formatTimestamp(rows[i].measuredAt))}</title></g>`).join('')}<text x="66" y="249">${esc(xLabel(g.first))}</text>${g.last!==g.first ? `<text x="614" y="249" text-anchor="end">${esc(xLabel(g.last))}</text>` : ''}<text x="338" y="272" text-anchor="middle">Datum${g.last-g.first<86400000 ? ' / Uhrzeit' : ''}</text></svg></div><div class="time-selected" aria-live="polite"><strong>${esc(formatSeconds(selected.seconds))} s</strong><span>${esc(formatTimestamp(selected.measuredAt))}</span>${selected.notes ? `<p>${esc(selected.notes)}</p>` : ''}</div>`;
}
export function timeResults(allRows,range,selectedId) {
  const rows=filterMeasurements(allRows,range),latest=rows.at(-1);
  const best=rows.length ? rows.reduce((a,b)=>a.seconds>=b.seconds ? a : b) : null;
  return `<div class="stats time-stats"><div class="stat"><div><strong>${latest ? esc(formatSeconds(latest.seconds))+' s' : '—'}</strong><small>Letzte Messung</small></div></div><div class="stat"><div><strong>${best ? esc(formatSeconds(best.seconds))+' s' : '—'}</strong><small>Längste Dauer</small></div></div><div class="stat"><div><strong>${rows.length}</strong><small>Messungen</small></div></div></div><section class="panel"><h2>Dein Verlauf</h2><div class="pill-tabs" aria-label="Zeitraum auswählen">${[['30','30 Tage'],['90','90 Tage'],['all','Alle']].map(([v,label])=>`<button data-action="time-range" data-value="${v}" aria-pressed="${v===range}" class="${v===range ? 'active' : ''}">${label}</button>`).join('')}</div>${chart(rows,selectedId)}</section><section class="time-history"><div class="section-heading"><h2>Deine Messungen <span class="count">${rows.length}</span></h2></div>${rows.length ? `<div class="time-list">${[...rows].reverse().map(r=>`<article class="time-row"><div class="time-row-content"><strong>${esc(formatSeconds(r.seconds))} s</strong><time datetime="${esc(r.measuredAt)}">${esc(formatTimestamp(r.measuredAt))}</time>${r.notes ? `<p>${esc(r.notes)}</p>` : ''}</div><div class="actions"><button class="button secondary small" data-action="edit-time" data-id="${esc(r.id)}">Bearbeiten</button><button class="button secondary small" data-action="delete-time" data-id="${esc(r.id)}">Löschen</button></div></article>`).join('')}</div>` : '<p class="subtle">Trage deine erste Messung ein oder wähle einen anderen Zeitraum.</p>'}</section>`;
}
