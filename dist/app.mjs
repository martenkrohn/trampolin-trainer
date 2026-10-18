import {parseSeconds, parseLocalTimestamp, formatTimestamp, measurementForm, timeResults} from './jump-time.mjs';
import { catalogueGroups, catalogueGroup, compareCatalogueJumps } from './catalogue-view.mjs';
import { emptyState, uid, formatD, calculateElement, evaluateRoutine, matchesSearch, validateBackup, createBackup, createRoutineFromTemplate, reconcileTraining, setGoalStatus, RULE_ID } from './core.mjs';
import { LocalStore } from './storage.mjs';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icons = { times: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6M12 2v3"/>', plus: '<path d="M12 5v14M5 12h14"/>', arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', training: '<path d="M4 7h16v14H4zM8 3v5m8-5v5M4 11h16m-11 5 2 2 4-4"/>', catalogue: '<path d="M4 4h6v7H4zM14 4h6v7h-6zM4 15h6v5H4zM14 15h6v5h-6z"/>', routines: '<path d="M8 5h12M8 12h12M8 19h12M3 5h1M3 12h1M3 19h1"/>', settings: '<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1"/><circle cx="12" cy="12" r="5"/>', check: '<path d="m5 12 4 4L19 6"/>', edit: '<path d="m14 4 6 6M4 20l5-1L21 7l-4-4L5 15z"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', star: '<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z"/>', trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>', up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>', spark: '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6z"/>', back: '<path d="M19 12H5m5-5-5 5 5 5"/>' };
const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24">${icons[name] || icons.info}</svg>`;
const shape = { tuck: 'Gehockt', pike: 'Gebückt', straight: 'Gestreckt', straddle_pike: 'Grätschwinkel', seat: 'Sitz', custom: 'Eigenes Element' };
const directions = { forward: 'Vorwärts', backward: 'Rückwärts', none: 'Grundsprung' };
const positions = { feet: 'Stand', seat: 'Sitz', front: 'Bauch', back: 'Rücken' };
const statusLabels = { planned: 'Geplant', working: 'In Arbeit', mastered: 'Beherrscht', paused: 'Pausiert', practice: 'Erneut üben' };
const profileLabels = { planning: 'Freie Planung' };
const store = new LocalStore();
let state, data, catalogue = [], baseMap = new Map();
let timeRange='all', selectedTime=null;
let search = '', goalFilter = 'active', picker = null, mutationQueue = Promise.resolve(), toastTimer;
const modal = $('#modal');
const jump = id => state?.customJumps.find(x => x.id === id) || baseMap.get(id);
const allJumps = () => [...catalogue, ...state.customJumps];
// Replace only known generated template text, preserving personal notes verbatim.
const templateNoteReplacements = new Map();
const routineNotes = r => (r?.notes || '').split('\n').map(line => templateNoteReplacements.get(line) ?? line).filter(Boolean).join('\n');
const route = () => (location.hash.slice(1) || 'training').split('/');
const family = j => j.custom ? 'Persönlich' : j.somersault_quarters >= 8 ? 'Mehrfachsalto' : j.somersault_quarters >= 3 ? 'Salto' : 'Grundsprung';
const options = (labels, selected) => Object.entries(labels).map(([v, label]) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
const btn = (label, action, cls = '', extra = '') => `<button class="button ${cls}" data-action="${action}" ${extra}>${label}</button>`;
const ibtn = (name, label, action, extra = '', cls = '') => `<button class="icon-button ${cls}" type="button" aria-label="${esc(label)}" title="${esc(label)}" data-action="${action}" ${extra}>${icon(name)}</button>`;
const notice = (text, type = '') => `<div class="notice ${type}">${icon('info')}<p>${esc(text)}</p></div>`;
const empty = (title, message, action, label, name = 'spark') => `<div class="empty"><div class="empty-icon">${icon(name)}</div><h3>${esc(title)}</h3><p>${esc(message)}</p>${action ? btn(`${icon('plus')}${esc(label)}`, action) : ''}</div>`;

function toast(text) { const el = $('#toast'); el.textContent = text; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 3800); }
function showDialog(title, body, subtitle = '') { picker = null; modal.innerHTML = `<div class="modal-head"><div><h2 id="dialog-title">${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>${ibtn('close', 'Dialog schließen', 'close-modal')}</div><div class="modal-body">${body}</div>`; if (!modal.open) modal.showModal(); }
function closeDialog() { if (modal.open) modal.close(); picker = null; }
function commit(mutator, message = '', comparePrevious = true) {
  const task = mutationQueue.then(async () => {
    const next = structuredClone(state); mutator(next); reconcileTraining(next, comparePrevious ? state : null); next.updatedAt = new Date().toISOString();
    try { await store.save(next); state = next; render(); if (message) toast(message); return true; }
    catch (error) { toast(`Nicht gespeichert: ${error.message || 'Gerätespeicher nicht verfügbar. Bitte ein Backup exportieren.'}`); return false; }
  });
  mutationQueue = task.catch(() => {}); return task;
}
function render() {
  const [page, id] = route();
  const active = ['routine','practice'].includes(page) ? 'routines' : ['training', 'catalogue', 'routines', 'times', 'settings'].includes(page) ? page : 'training';
  const nav = [['training', 'Training'], ['catalogue', 'Sprungkatalog'], ['routines', 'Sprungfolgen'], ['times', 'Sprungzeit'], ['settings', 'Einstellungen']];
  $('#app').innerHTML = `<aside class="sidebar"><a class="brand" href="#training"><img src="./icon-96.png" width="43" height="43" alt=""><div>Trampolin<small>Dein Trainingsplaner</small></div></a><nav class="nav" aria-label="Hauptnavigation">${nav.map(([p, name]) => `<a href="#${p}" class="${active === p ? 'active' : ''}" ${active === p ? 'aria-current="page"' : ''}>${icon(p)}<span>${name}</span></a>`).join('')}</nav><div class="sidebar-bottom"><div class="saved"><span></span>Deine Daten bleiben bei dir</div><p>Trainiere in deinem Tempo.<br>Ein Sprung nach dem anderen.</p><small>Trampolin Trainer · Version 1.0</small></div></aside><div class="shell"><header class="topbar"><span class="eyebrow">Trampolin Trainer</span><div class="topbar-right"><div class="saved ${!navigator.onLine ? 'offline-label' : ''}"><span></span>${!navigator.onLine ? 'Offline' : store.mode === 'memory' ? 'Nur diese Sitzung' : 'Lokal gespeichert'}</div></div></header><main id="main" tabindex="-1">${store.mode === 'memory' ? notice('Dein Browser erlaubt keine dauerhafte Speicherung. Änderungen bleiben nur in dieser Sitzung. Sichere deine Daten über Export.', 'error') : ''}${active === 'training' ? trainingPage() : active === 'catalogue' ? cataloguePage() : active === 'times' ? timesPage() : active === 'settings' ? settingsPage() : page === 'routine' ? routinePage(id) : page === 'practice' ? practicePage(id) : routinesPage()}</main><footer class="page-foot"><span>Dein Training. Dein Fortschritt.</span></footer></div>`;
}
function heading(title, subtitle, action = '') { return `<div class="heading"><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${action}</div>`; }
function timesPage() {
  return `${heading('10 Strecksprünge','Halte deine Sprungzeit fest und verfolge deinen Verlauf.')}<section class="panel time-entry"><h2>Neue Messung</h2>${measurementForm()}</section><div id="time-results">${timeResults(state.jumpTimes || [],timeRange,selectedTime)}</div>`;
}
function refreshTimeResults() { const root=$('#time-results'); if (root) root.innerHTML=timeResults(state.jumpTimes || [],timeRange,selectedTime); }
function trainingPage() {
  const mastered = state.goals.filter(g => g.status === 'mastered').length;
  const working = state.goals.filter(g => ['working', 'practice'].includes(g.status)).length;
  const active = state.goals.filter(g => !['mastered', 'paused'].includes(g.status));
  const shown = state.goals.filter(g => goalFilter === 'active' ? !['mastered', 'paused'].includes(g.status) : goalFilter === 'mastered' ? g.status === 'mastered' : goalFilter === 'paused' ? g.status === 'paused' : true);
  return `<section class="hero"><div><h2>Platz für deinen Fortschritt</h2><p>${active.length ? `Du hast ${active.length} aktive Trainingsziele. Nimm dir heute eines davon vor.` : 'Entdecke neue Elemente und halte fest, woran du als Nächstes arbeiten möchtest.'}</p></div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="orbit two"></div><img src="./icon-512.png" width="180" height="180" alt=""><div class="art-dot"></div></div></section><div class="stats"><div class="stat"><div class="stat-icon">${icon('training')}</div><div><strong>${state.goals.length}</strong><small>Trainingsziele</small></div></div><div class="stat"><div class="stat-icon">${icon('spark')}</div><div><strong>${working}</strong><small>In Arbeit</small></div></div><div class="stat"><div class="stat-icon">${icon('check')}</div><div><strong>${mastered}</strong><small>Beherrscht</small></div></div></div><div class="section-heading training-goals-heading"><div><h2>Meine Trainingsziele <span class="count">${shown.length}</span></h2><p>Alles, was du dir vorgenommen hast.</p></div>${btn(`${icon('plus')}Trainingsziel`, 'add-goal')}</div><div class="pill-tabs" aria-label="Trainingsziele filtern">${Object.entries({ active: 'Aktuell', mastered: 'Beherrscht', paused: 'Pausiert', all: 'Alle' }).map(([v, t]) => `<button data-action="goal-filter" data-value="${v}" class="${goalFilter === v ? 'active' : ''}" aria-pressed="${goalFilter === v}">${t}</button>`).join('')}</div><div style="height:15px"></div>${shown.length ? `<div class="goal-list">${shown.map(goalRow).join('')}</div>` : empty(state.goals.length ? 'Hier ist gerade Platz' : 'Was möchtest du als Nächstes lernen?', state.goals.length ? 'Wähle einen anderen Filter oder ergänze ein neues Trainingsziel.' : 'Wähle einen Sprung aus dem Katalog oder notiere ein eigenes Ziel.', '', '', 'training')}`;
}
function goalRow(g) { return `<article class="goal-row ${g.status}"><button class="check ${g.status === 'mastered' ? 'checked' : ''}" data-action="toggle-goal" data-id="${esc(g.id)}" aria-label="${esc(g.title)} ${g.status === 'mastered' ? 'erneut üben' : 'als beherrscht markieren'}" aria-pressed="${g.status === 'mastered'}">${g.status === 'mastered' ? icon('check') : ''}</button><div class="goal-content"><h3>${g.routineId ? `<a href="#practice/${esc(g.routineId)}">${esc(g.title)}</a>` : esc(g.title)}</h3>${g.routineId ? `<span class="subtle">Sprungfolge · <a href="#practice/${esc(g.routineId)}">Üben</a></span>` : g.jumpId && jump(g.jumpId) ? `<button class="text-link" style="border:0;background:none;padding:0" data-action="jump-detail" data-id="${esc(g.jumpId)}">Sprung ansehen</button>` : `<span class="subtle">Freies Trainingsziel</span>`}${g.notes ? `<p>${esc(g.notes)}</p>` : ''}</div><div class="actions"><select class="status-select ${g.status}" data-goal-status="${esc(g.id)}" aria-label="Status für ${esc(g.title)}">${options(statusLabels, g.status)}</select>${ibtn('edit', 'Ziel bearbeiten', 'edit-goal', `data-id="${esc(g.id)}"`)}</div></article>`; }
function jumpCard(j) { const d = calculateElement(j); return `<article class="jump-card"><div class="card-top"><span class="family">${family(j)}</span><span class="d-value" aria-label="${d.manual ? 'Eigener D-Wert' : 'D-Wert'} ${formatD(d.value)}">${formatD(d.value)}</span></div><h3>${esc(j.name_de)}</h3><div class="card-tags"><span class="badge">${esc(shape[j.body_position] || 'Eigene Form')}</span>${j.custom ? j.manualDifficultyTenths != null ? '<span class="badge amber">D selbst angegeben</span>' : '' : `<span class="badge ${j.somersault_quarters >= 8 ? 'amber' : ''}">${esc(directions[j.rotation_direction])}</span>`}</div><div class="card-bottom"><button class="text-link" style="border:0;background:none;padding:0" data-action="jump-detail" data-id="${esc(j.id)}">Details ${icon('arrow')}</button>${ibtn('plus', `${j.name_de} als Trainingsziel`, 'goal-from-jump', `data-id="${esc(j.id)}"`)}</div></article>`; }
function filteredJumps() { return allJumps().filter(j => matchesSearch(j, search)); }
function catalogueResults() {
  const found = filteredJumps().sort(compareCatalogueJumps);
  const meta = `<div class="results-meta"><span>${found.length} von ${allJumps().length} Elementen</span></div>`;
  if (!found.length) return meta + empty('Kein passender Sprung', 'Probiere einen anderen Namen, ein Synonym oder einen Zahlencode. Du kannst auch ein eigenes Element anlegen.', 'custom-jump', 'Eigenes Element', 'search');
  const sections = catalogueGroups.map((name, index) => {
    const jumps = found.filter(j => catalogueGroup(j) === index);
    return jumps.length ? `<section class="catalogue-section" aria-labelledby="catalogue-group-${index}" data-catalogue-group="${index}"><div class="section-heading"><h2 id="catalogue-group-${index}">${esc(name)} <span class="count">${jumps.length}</span></h2></div><div class="catalogue-grid">${jumps.map(jumpCard).join('')}</div></section>` : '';
  }).join('');
  const custom = found.filter(j => j.custom);
  return meta + sections + (custom.length ? `<div class="catalogue-custom"><p class="subtle">Deine eigenen Elemente</p><div class="catalogue-grid">${custom.map(jumpCard).join('')}</div></div>` : '');
}
function cataloguePage() { return `${heading('Sprungkatalog', 'Finde dein Element. Vom Grundsprung bis zum Mehrfachsalto.', btn(`${icon('plus')}Eigenes Element`, 'custom-jump', 'secondary'))}<div class="toolbar"><div class="search">${icon('search')}<input id="catalogue-search" type="search" placeholder="Sprung, Synonym oder Code suchen …" aria-label="Sprungkatalog durchsuchen" value="${esc(search)}"></div></div><div id="catalogue-results">${catalogueResults()}</div>`; }
function routinesPage() {
  const list = [...state.routines].sort((a, b) => Number(b.favorite) - Number(a.favorite));
  return `${heading('Meine Sprungfolgen', 'Zusammenstellen, vergleichen und für dein Training vorbereiten.', btn(`${icon('plus')}Neue Sprungfolge`, 'new-routine'))}<div class="callout" style="margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;gap:15px"><div><h3>Mit einer Vorlage starten</h3><p style="margin:0">${data.uebungsvorlagen.length} Vorlagen für dein Training</p></div>${btn('Vorlagen ansehen', 'template', 'secondary small')}</div>${list.length ? `<div class="routine-grid">${list.map(r => { const result = evaluateRoutine({ ...r, profile: 'planning' }, jump); return `<article class="routine-card"><div class="routine-card-head"><div><h3>${esc(r.name)}</h3><p>${esc(profileLabels.planning)} · ${r.kind === 'compulsory' ? 'Pflichtentwurf' : 'Kür'}</p></div>${ibtn('star', r.favorite ? 'Favorit entfernen' : 'Als Favorit markieren', 'favorite', `data-id="${esc(r.id)}"`, r.favorite ? 'favorite' : '')}</div><div class="routine-meta"><span class="badge ${result.complete ? 'green' : ''}">${r.elements.length}/${result.targetElementCount} Elemente</span>${result.manual ? '<span class="badge amber">Eigene Werte</span>' : ''}</div><div class="routine-card-foot"><div><strong class="big-d">${formatD(result.total)}</strong><p>${esc(result.label)}</p></div><div class="routine-buttons"><a class="button small" href="#practice/${esc(r.id)}">Üben</a><a class="button secondary small" href="#routine/${esc(r.id)}">Bearbeiten ${icon('arrow')}</a></div></div></article>`; }).join('')}</div>` : empty('Deine erste Sprungfolge wartet', 'Stelle Sprünge in deiner Wunschreihenfolge zusammen. Du kannst Entwürfe jederzeit weiter bearbeiten.', 'new-routine', 'Sprungfolge erstellen', 'routines')}`;
}
function practiceTarget(r, elementId = '') {
  if (!elementId) return {status:r.trainingStatus || 'planned', notes:r.trainingNotes || ''};
  return r.elements.find(e => e.id === elementId);
}
function practiceSelect(r, elementId = '', label = 'Gesamtstatus') {
  const t=practiceTarget(r,elementId);
  return `<select class="status-select ${esc(t.status || 'planned')}" data-practice-status="${esc(r.id)}" data-element="${esc(elementId)}" aria-label="${esc(label)}">${options(statusLabels,t.status || 'planned')}</select>`;
}
function practiceNotesButton(r, elementId = '', label = 'Notiz bearbeiten') {
  return btn(label,'practice-notes','secondary small',`data-id="${esc(r.id)}" data-element="${esc(elementId)}"`);
}
function practicePage(id) {
  const r=state.routines.find(r => r.id === id);
  if (!r) return `${heading('Sprungfolge nicht gefunden','Sie wurde möglicherweise gelöscht.')}<a class="button" href="#routines">Zu meinen Sprungfolgen</a>`;
  const goal=state.goals.find(g => g.routineId === id);
  return `<a class="text-link" href="#routines">${icon('back')}Alle Sprungfolgen</a>${heading(r.name,'Üben · Dein aktueller Lernstand',`<a class="button secondary small" href="#routine/${esc(id)}">Bearbeiten</a>`)}<section class="panel practice-overall"><div class="practice-heading"><h2>Gesamte Sprungfolge</h2>${practiceSelect(r)}</div><p class="subtle">Bewerte die gesamte Folge unabhängig von ihren einzelnen Sprüngen.</p>${r.trainingNotes ? `<p class="practice-note">${esc(r.trainingNotes)}</p>` : ''}<div class="button-row">${practiceNotesButton(r)}${goal ? btn('Trainingsziel bearbeiten','edit-goal','secondary small',`data-id="${esc(goal.id)}"`) : btn(`${icon('plus')}Als Trainingsziel`,'goal-from-routine','small',`data-id="${esc(id)}"`)}</div></section><div class="section-heading"><h2>Sprünge</h2></div><div class="practice-list">${r.elements.length ? r.elements.map((e,i) => { const j=jump(e.jumpId); return `<article class="practice-element"><div class="practice-heading"><div class="practice-jump"><span class="element-number">${i+1}</span>${j ? `<button class="practice-name" data-action="practice-jump" data-id="${esc(id)}" data-element="${esc(e.id)}">${esc(j.name_de)}</button>` : '<strong>Unbekanntes Element</strong>'}</div>${practiceSelect(r,e.id,`Status für Sprung ${i+1}`)}</div>${e.notes ? `<p class="practice-note">${esc(e.notes)}</p>` : ''}${practiceNotesButton(r,e.id,`Notiz zu Sprung ${i+1}`)}</article>`; }).join('') : empty('Diese Folge hat noch keine Sprünge','Füge im Bearbeitungsfenster Sprünge hinzu.','','','routines')}</div>`;
}
function practiceNotesForm(r, elementId) {
  const t=practiceTarget(r,elementId),i=r.elements.findIndex(e => e.id === elementId);
  showDialog(elementId ? `Sprung ${i+1}: ${jump(t.jumpId)?.name_de || 'Unbekanntes Element'}` : 'Gesamte Sprungfolge',`<form data-form="practice" data-id="${esc(r.id)}" data-element="${esc(elementId)}"><div class="field"><label for="practice-notes">Meine Notizen</label><textarea id="practice-notes" name="notes" maxlength="2000">${esc(t.notes)}</textarea></div><div class="modal-actions"><button class="button" type="submit">Notiz speichern</button></div></form>`);
}
function routinePage(id) {
  const r = state.routines.find(x => x.id === id);
  if (!r) return `${heading('Sprungfolge nicht gefunden', 'Sie wurde möglicherweise gelöscht.')}<a class="button" href="#routines">Zu meinen Sprungfolgen</a>`;
  const result = evaluateRoutine({ ...r, profile: 'planning' }, jump);
  return `<a class="text-link" href="#routines" style="margin-bottom:18px">${icon('back')}Alle Sprungfolgen</a>${heading(r.name, 'Jede Änderung wird automatisch auf diesem Gerät gespeichert.', `<a class="button small" href="#practice/${esc(r.id)}">Üben</a> ${ibtn('edit', 'Name und Notizen bearbeiten', 'edit-routine', `data-id="${esc(r.id)}"`)} ${ibtn('copy', 'Sprungfolge kopieren', 'copy-routine', `data-id="${esc(r.id)}"`)} ${ibtn('trash', 'Sprungfolge löschen', 'delete-routine', `data-id="${esc(r.id)}"`, 'danger')}`)}<section class="summary-strip"><div><small>${esc(result.label)}</small><strong class="total">${formatD(result.total)}</strong></div><div class="summary-facts"><div><strong>${r.elements.length}/${result.targetElementCount}</strong><span>Elemente</span></div><div><strong>${formatD(result.subtotal)}</strong><span>Element-D</span></div></div></section><div class="routine-content"><div><div class="section-heading"><h2>Sprungfolge</h2><span class="subtle">Mit den Pfeilen umsortieren</span></div>${result.elements.length ? result.elements.map((e, i) => `<article class="element-row ${e.repeated || e.forbidden || e.rebound || e.value == null ? 'problem' : ''}"><div class="element-number">${i + 1}</div><div class="element-title"><h3>${esc(e.jump?.name_de || 'Unbekanntes Element')}</h3><p>${esc(e.jump?.fig_code || 'Eigener Eintrag')}${e.repeated ? ' · Wiederholung' : ''}${e.capped ? ' · Altersdeckel' : ''}${e.manual ? ' · Eigener D-Wert' : ''}</p></div><strong class="d-value">${formatD(e.scored)}</strong><div class="element-controls">${ibtn('up', 'Sprung nach oben', 'move-element', `data-routine="${esc(r.id)}" data-id="${esc(e.id)}" data-step="-1" ${i === 0 ? 'disabled' : ''}`)}${ibtn('down', 'Sprung nach unten', 'move-element', `data-routine="${esc(r.id)}" data-id="${esc(e.id)}" data-step="1" ${i === r.elements.length - 1 ? 'disabled' : ''}`)}${ibtn('edit', 'Sprung austauschen', 'replace-element', `data-routine="${esc(r.id)}" data-id="${esc(e.id)}"`)}${ibtn('copy', 'Sprung duplizieren', 'duplicate-element', `data-routine="${esc(r.id)}" data-id="${esc(e.id)}"`)}${ibtn('trash', 'Sprung entfernen', 'remove-element', `data-routine="${esc(r.id)}" data-id="${esc(e.id)}"`)}</div></article>`).join('') : empty('Welche Sprünge gehören hinein?', 'Füge dein erstes Element hinzu. Auch eine unvollständige Sprungfolge bleibt gespeichert.', '', '', 'routines')}<button class="add-element" data-action="add-element" data-id="${esc(r.id)}">${icon('plus')}Sprung hinzufügen</button>${routineNotes(r) ? `<div class="panel" style="margin-top:20px"><h3 class="small-heading" style="margin:0 0 10px">Meine Notizen</h3><p class="subtle" style="white-space:pre-wrap">${esc(routineNotes(r))}</p></div>` : ''}</div></div>`;
}
function settingsPage() {
  return `${heading('Einstellungen', 'Deine Daten sichern und wiederherstellen.')}<div class="settings-grid"><section class="panel"><h2>Datensicherung</h2><div class="backup-notice">${icon('info')}<p><strong>Deine Daten werden nur lokal in diesem Browser gespeichert.</strong> Wenn du die Website-Daten löschst, gehen auch deine Einträge verloren. Exportiere deshalb regelmäßig ein Backup.</p></div><div class="button-row">${btn(`${icon('download')}Backup exportieren`, 'export')}${btn('Backup importieren', 'import', 'secondary')}</div><input type="file" id="import-file" accept="application/json,.json" hidden></section></div>`;
}

function showJump(id) {
  const j = jump(id); if (!j) return toast('Dieses Element ist nicht im aktuellen Katalog.');
  const result = calculateElement(j);
  showDialog(j.name_de, `<div class="dialog-total jump-difficulty"><span class="difficulty-label">D-Wert</span><strong>${formatD(result.value)}</strong></div>${j.custom ? notice('Dieser Eintrag und sein D-Wert wurden von dir erstellt.') : ''}<div class="info-table"><div class="info-item"><small>Körperform</small><strong>${esc(shape[j.body_position] || 'Nicht angegeben')}</strong></div><div class="info-item"><small>Richtung</small><strong>${esc(directions[j.rotation_direction] || 'Nicht angegeben')}</strong></div><div class="info-item"><small>Saltorotation</small><strong>${j.somersault_quarters != null ? `${j.somersault_quarters * 90}°` : 'Nicht angegeben'}</strong></div><div class="info-item"><small>Schraubenrotation</small><strong>${j.twist_half_turns_by_phase ? `${j.twist_half_turns_by_phase.reduce((a, b) => a + b, 0) * 180}°` : 'Nicht angegeben'}</strong></div><div class="info-item"><small>Ausgangsposition</small><strong>${esc(positions[j.takeoff_position] || 'Nicht angegeben')}</strong></div><div class="info-item"><small>Landeposition</small><strong>${esc(positions[j.landing_position] || 'Nicht angegeben')}</strong></div></div>${j.description ? `<p class="subtle" style="white-space:pre-wrap">${esc(j.description)}</p>` : ''}<div class="modal-actions">${j.custom ? btn('Eigenes Element löschen', 'delete-custom', 'danger small', `data-id="${esc(j.id)}"`) : ''}${btn(`${icon('plus')}Als Trainingsziel`, 'goal-from-jump', '', `data-id="${esc(j.id)}"`)}</div>`, j.custom ? 'Dein persönlicher Eintrag' : 'Technische Angaben');
}
function goalForm(g = null, selectedJump = null) {
  showDialog(g ? 'Trainingsziel bearbeiten' : 'Freies Trainingsziel', `<form data-form="goal" data-id="${esc(g?.id || '')}" data-jump="${esc(g?.jumpId || selectedJump || '')}"><div class="field"><label for="goal-title">Mein Ziel</label><input id="goal-title" name="title" required maxlength="200" value="${esc(g?.title || '')}" ${g?.routineId ? 'readonly' : ''} placeholder="Zum Beispiel: Rückenlandung stabilisieren"></div><div class="field"><label for="goal-status">Status</label><select id="goal-status" name="status">${options(statusLabels, g?.status || 'planned')}</select></div><div class="field"><label for="goal-notes">Meine Notizen</label><textarea id="goal-notes" name="notes" maxlength="2000" placeholder="Was möchte ich beim nächsten Training beachten?">${esc(g?.notes || '')}</textarea></div>${g ? `<div class="button-row">${g.routineId ? '' : btn('Sprung austauschen', 'replace-goal-jump', 'secondary small', `type="button" data-id="${esc(g.id)}"`)}${btn('Ziel löschen', 'delete-goal', 'danger small', `type="button" data-id="${esc(g.id)}"`)}</div>${g.routineId ? '<p class="subtle">Der Name wird aus der Sprungfolge übernommen. Status und Notizen gelten auch in der Üben-Ansicht.</p>' : '<p class="subtle">Änderungen an Name und Notizen bitte vor dem Austauschen speichern.</p>'}` : ''}<div class="modal-actions"><button class="button" type="submit">${icon('check')}Ziel speichern</button></div></form>`);
}
function routineForm(r = null) { showDialog(r ? 'Sprungfolge bearbeiten' : 'Neue Sprungfolge', `<form data-form="routine" data-id="${esc(r?.id || '')}"><div class="field"><label for="routine-name">Name deiner Sprungfolge</label><input id="routine-name" name="name" required maxlength="200" value="${esc(r?.name || '')}" placeholder="Zum Beispiel: Meine Kür"></div><div class="field"><label for="routine-notes">Notizen</label><textarea id="routine-notes" name="notes" maxlength="2000">${esc(routineNotes(r))}</textarea></div><div class="modal-actions"><button class="button" type="submit">${icon('check')}${r ? 'Änderungen speichern' : 'Sprungfolge erstellen'}</button></div></form>`); }
function showPicker(mode, routineId = null, elementId = null) {
  showDialog(mode === 'goal' ? 'Dein nächstes Trainingsziel' : mode === 'replace-goal' ? 'Sprung für dein Ziel auswählen' : mode === 'replace' ? 'Sprung austauschen' : 'Sprung zur Sprungfolge hinzufügen', `<div class="search">${icon('search')}<input id="picker-search" type="search" placeholder="Sprung oder Code suchen …" aria-label="Element auswählen"></div>${mode === 'goal' ? `<div style="margin-top:12px">${btn('Eigenes Ziel frei formulieren', 'free-goal', 'secondary small')}</div>` : ''}<div class="picker-list" id="picker-list"></div>`);
  picker = { mode, routineId, elementId }; renderPicker(''); $('#picker-search', modal).focus();
}
function renderPicker(query) {
  if (!picker) return;
  const found = allJumps().filter(j => matchesSearch(j, query));
  const routines = picker.mode === 'goal' ? state.routines.filter(r => matchesSearch({name_de:r.name},query)) : [];
  $('#picker-list', modal).innerHTML = routines.map(r => `<button class="picker-row" data-action="goal-from-routine" data-id="${esc(r.id)}"><div><strong>${esc(r.name)}</strong><small>Sprungfolge · ${r.elements.length} Elemente${state.goals.some(g => g.routineId === r.id) ? ' · Bereits Trainingsziel' : ''}</small></div>${icon('routines')}</button>`).join('') + (found.length ? found.map(j => `<button class="picker-row" data-action="pick" data-id="${esc(j.id)}"><div><strong>${esc(j.name_de)}</strong><small>${esc(j.fig_code || 'Eigener Eintrag')} · ${esc(family(j))}</small></div><span class="d-value">${formatD(calculateElement(j).value)}</span></button>`).join('') : routines.length ? '' : '<p class="subtle">Keine passenden Elemente gefunden.</p>');
}
async function addGoal(id) {
  const j = jump(id); if (!j) return;
  const existing = state.goals.find(g => g.jumpId === id);
  if (existing) { goalForm(existing); toast('Dieses Element ist bereits in deinen Trainingszielen.'); return; }
  const ok = await commit(s => { if (!s.goals.some(g => g.jumpId === id)) s.goals.push({ id: uid(), title: j.name_de, jumpId: id, notes: '', status: 'planned', createdAt: new Date().toISOString(), completedAt: null }); }, 'Trainingsziel hinzugefügt.');
  if (ok) closeDialog();
}
function confirmation(title, text, action, extra = '') { showDialog(title, `<p class="subtle">${esc(text)}</p><div class="modal-actions">${btn('Abbrechen', 'close-modal', 'secondary')}${btn('Bestätigen', action, 'danger', extra)}</div>`); }
function download(name, content) { const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button || !state) return;
  const a = button.dataset.action, id = button.dataset.id, rid = button.dataset.routine;
  if (a === 'time-range') { timeRange=button.dataset.value; selectedTime=null; refreshTimeResults(); return; }
  if (a === 'time-point') { selectedTime=id; refreshTimeResults(); const point=$('[data-action="time-point"][data-id="'+CSS.escape(id)+'"]'); point?.focus({preventScroll:true}); return; }
  if (a === 'edit-time') { const m=state.jumpTimes?.find(m=>m.id===id); if (m) showDialog('Messung bearbeiten',measurementForm(m)); return; }
  if (a === 'delete-time') return confirmation('Messung löschen?','Diese Messung wird aus deinem Verlauf entfernt.','confirm-delete-time',`data-id="${esc(id)}"`);
  if (a === 'confirm-delete-time') { if (await commit(s=>{s.jumpTimes=s.jumpTimes.filter(m=>m.id!==id);},'Messung gelöscht.')) closeDialog(); return; }
  if (a === 'close-modal') return closeDialog();
  if (a === 'add-goal') return showPicker('goal');
  if (a === 'free-goal') return goalForm();
  if (a === 'edit-goal') return goalForm(state.goals.find(x => x.id === id));
  if (a === 'goal-filter') { goalFilter = button.dataset.value; return render(); }
  if (a === 'jump-detail') return showJump(id);
  if (a === 'goal-from-routine') {
    const existing=state.goals.find(g => g.routineId === id);
    if (existing) return goalForm(existing);
    if (await commit(s => {
    const r=s.routines.find(r => r.id === id); if (!r || s.goals.some(g => g.routineId === id)) return;
    s.goals.push({id:uid(),routineId:id,jumpId:null,title:r.name,status:r.trainingStatus || 'planned',notes:r.trainingNotes || '',createdAt:new Date().toISOString(),completedAt:null});
    },'Sprungfolge als Trainingsziel hinzugefügt.')) closeDialog();
    return;
  }
  if (a === 'practice-notes') { const r=state.routines.find(r => r.id === id); if (r) practiceNotesForm(r,button.dataset.element); return; }
  if (a === 'practice-jump') {
    const r=state.routines.find(r => r.id === id),e=r?.elements.find(e => e.id === button.dataset.element); if (!e) return;
    showJump(e.jumpId);
    const existing=state.goals.find(g => g.jumpId === e.jumpId);
    $('#modal .modal-actions [data-action="goal-from-jump"]').innerHTML=existing ? 'Trainingsziel bearbeiten' : `${icon('plus')}Als einzelnes Trainingsziel`;
    $('.modal-actions',modal).insertAdjacentHTML('beforebegin',`<div class="panel"><h3>In dieser Sprungfolge</h3>${practiceSelect(r,e.id,'Status innerhalb der Sprungfolge')}<p class="subtle">Dieser Status ist unabhängig vom einzelnen Trainingsziel.</p>${e.notes ? `<p class="practice-note">${esc(e.notes)}</p>` : ''}${practiceNotesButton(r,e.id)}</div>`);
    return;
  }
  if (a === 'goal-from-jump') return addGoal(id);
  if (a === 'replace-goal-jump') return showPicker('replace-goal', null, id);
  if (a === 'toggle-goal') return commit(s => { const g = s.goals.find(x => x.id === id); if (g) { setGoalStatus(s,g,g.status === 'mastered' ? 'practice' : 'mastered'); } }, 'Trainingsstatus gespeichert.');
  if (a === 'delete-goal') return confirmation('Trainingsziel löschen?', state.goals.find(g => g.id === id)?.routineId ? 'Das Ziel wird aus deinen Trainingszielen entfernt. Die Sprungfolge und ihre Übungsbewertungen und Notizen bleiben gespeichert.' : 'Das Ziel und seine persönlichen Notizen werden entfernt.', 'confirm-delete-goal', `data-id="${esc(id)}"`);
  if (a === 'confirm-delete-goal') { if (await commit(s => { s.goals = s.goals.filter(g => g.id !== id); }, 'Trainingsziel gelöscht.')) closeDialog(); return; }
  if (a === 'new-routine') return routineForm();
  if (a === 'edit-routine') return routineForm(state.routines.find(x => x.id === id));
  if (a === 'favorite') return commit(s => { const r = s.routines.find(x => x.id === id); if (r) r.favorite = !r.favorite; });
  if (a === 'copy-routine') { let newId; await commit(s => { const original = s.routines.find(x => x.id === id); if (!original) return; const copy = structuredClone(original); newId = uid(); copy.id = newId; copy.name = (copy.name + ' · Kopie').slice(0, 200); copy.favorite = false; copy.trainingStatus='planned'; copy.trainingNotes=''; copy.transitions=[]; copy.elements.forEach(e => { e.id=uid(); e.status='planned'; e.notes=''; }); s.routines.push(copy); }, 'Sprungfolge kopiert.'); if (newId) location.hash = `routine/${newId}`; return; }
  if (a === 'delete-routine') return confirmation('Sprungfolge löschen?', 'Die Sprungfolge, ihre Übungsbewertungen und ihr verknüpftes Trainingsziel werden entfernt.', 'confirm-delete-routine', `data-id="${esc(id)}"`);
  if (a === 'confirm-delete-routine') { if (await commit(s => { s.routines = s.routines.filter(r => r.id !== id); }, 'Sprungfolge gelöscht.')) { closeDialog(); location.hash = 'routines'; } return; }
  if (a === 'add-element') return showPicker('add', id);
  if (a === 'replace-element') return showPicker('replace', rid, id);
  if (a === 'move-element') return commit(s => { const r = s.routines.find(x => x.id === rid); const i = r?.elements.findIndex(e => e.id === id); if (i == null || i < 0) return; const next = i + Number(button.dataset.step); if (next >= 0 && next < r.elements.length) [r.elements[i], r.elements[next]] = [r.elements[next], r.elements[i]]; });
  if (a === 'duplicate-element') return commit(s => { const r = s.routines.find(x => x.id === rid); if (!r || r.elements.length >= 100) return; const i = r.elements.findIndex(e => e.id === id); if (i >= 0) r.elements.splice(i + 1, 0, { id: uid(), jumpId: r.elements[i].jumpId }); });
  if (a === 'remove-element') return commit(s => { const r = s.routines.find(x => x.id === rid); if (r) r.elements = r.elements.filter(e => e.id !== id); });
  if (a === 'pick' && picker) {
    const p = { ...picker };
    if (p.mode === 'goal') return addGoal(id);
    if (p.mode === 'replace-goal') { const j = jump(id); if (await commit(s => { const g = s.goals.find(x => x.id === p.elementId); if (g) { g.jumpId = id; g.title = j.name_de; g.status = 'planned'; g.completedAt = null; } }, 'Sprung im Trainingsziel ausgetauscht.')) closeDialog(); return; }
    if (await commit(s => { const r = s.routines.find(x => x.id === p.routineId); if (!r) return; if (p.mode === 'replace') { const e = r.elements.find(x => x.id === p.elementId); if (e) e.jumpId = id; } else if (r.elements.length < 100) r.elements.push({ id: uid(), jumpId: id }); r.updatedAt = new Date().toISOString(); }, 'Sprungfolge gespeichert.')) closeDialog(); return;
  }
  if (a === 'template') {
    return showDialog('Vorlagen für Sprungfolgen', `<p class="subtle">Wähle eine Vorlage und sieh dir die Sprungfolge an. Beim Laden entsteht eine bearbeitbare persönliche Kopie.</p><div class="picker-list template-list">${[...data.uebungsvorlagen].sort((a,b)=>(a.group==='Hochschulsport')-(b.group==='Hochschulsport')).map(t=>`<button class="picker-row" data-action="preview-template" data-id="${esc(t.id)}"><div><strong>${esc(t.display_name || t.name)}</strong><small>${esc(t.description || t.name)}</small><small>${t.elements.length} Elemente · ${esc(t.group || 'Vorlage')}</small></div><span class="d-value">${formatD(t.reference_planning_difficulty_tenths)}</span></button>`).join('')}</div>`);
  }
  if (a === 'preview-template') {
    const t=data.uebungsvorlagen.find(t=>t.id===id); if(!t)return;
    return showDialog(t.display_name || t.name, `<div class="dialog-total"><div><small>${t.elements.length} Elemente · ${esc(t.group || 'Vorlage')}</small><p class="subtle" style="color:#d5c8e2;margin:5px 0 0">D-Planungssumme</p></div><strong>${formatD(t.reference_planning_difficulty_tenths)}</strong></div><p class="subtle">${esc(t.description || '')}</p><ol class="template-steps">${t.elements.map(e=>{const j=jump(e.jump_id || e.allowed_jump_ids[0]);return `<li>${esc(j?.name_de || e.name)}${e.allowed_jump_ids ? '<small>Körperform wählbar; zunächst gehockt</small>' : ''}</li>`;}).join('')}</ol><div class="modal-actions">${btn('Zur Auswahl','template','secondary')}${btn('Vorlage übernehmen','load-template','',`data-id="${esc(id)}"`)}</div>`, 'Sprungfolge · persönliche Planungskopie');
  }
  if (a === 'load-template') {
    const template=data.uebungsvorlagen.find(t=>t.id===id); if(!template)return;
    const copy=createRoutineFromTemplate(template);
    if(await commit(s=>s.routines.push(copy),'Persönliche Vorlagenkopie erstellt.')){closeDialog();location.hash=`routine/${copy.id}`;}return;
  }
  if (a === 'custom-jump') return showDialog('Eigenes Element', `<form data-form="custom">
    <div class="field"><label for="custom-name">Name</label><input id="custom-name" name="name" required maxlength="200" placeholder="Name deines Elements"></div>
    <div class="field"><label for="custom-description">Beschreibung / Notizen</label><textarea id="custom-description" name="description" maxlength="2000"></textarea></div>
    <details class="custom-details"><summary>Ausführliche Angaben</summary><div class="custom-details-fields">
      <p class="subtle">Alle Angaben sind optional. Du kannst auch nur einzelne Details ergänzen.</p>
      <div class="field"><label for="custom-shape">Körperform</label><select id="custom-shape" name="body_position">${options({'':'Nicht angegeben',...shape},'')}</select></div>
      <div class="field"><label for="custom-direction">Rotationsrichtung</label><select id="custom-direction" name="rotation_direction">${options({'':'Nicht angegeben',forward:'Vorwärts',backward:'Rückwärts',none:'Keine Saltorotation'},'')}</select></div>
      <div class="field"><label for="custom-salto">Saltorotation (°)</label><input id="custom-salto" name="salto" type="number" inputmode="numeric" min="0" max="1440" step="90" placeholder="Zum Beispiel: 360"><small>In 90°-Schritten. Eine volle Rotation entspricht 360°.</small></div>
      <div class="field"><label for="custom-twist">Schraubenrotation (°)</label><input id="custom-twist" name="twist" type="number" inputmode="numeric" min="0" max="5760" step="180" placeholder="Zum Beispiel: 180"><small>In 180°-Schritten. Eine halbe Schraube entspricht 180°.</small></div>
      <div class="field"><label for="custom-takeoff">Ausgangsposition</label><select id="custom-takeoff" name="takeoff_position">${options({'':'Nicht angegeben',...positions},'')}</select></div>
      <div class="field"><label for="custom-landing">Landeposition</label><select id="custom-landing" name="landing_position">${options({'':'Nicht angegeben',...positions},'')}</select></div>
      <div class="field"><label for="custom-d">Eigener D-Wert (optional)</label><input id="custom-d" name="difficulty" inputmode="decimal" placeholder="Zum Beispiel: 0,6"><small>Leer lassen, wenn der Wert unbekannt ist. Der D-Wert wird als eigene Angabe gespeichert.</small></div>
    </div></details><p class="error-text" id="form-error" role="alert"></p><div class="modal-actions"><button class="button" type="submit">Element speichern</button></div></form>`);
  if (a === 'delete-custom') return confirmation('Eigenes Element löschen?', 'Trainingsziele und Sprungfolgen bleiben erhalten. Verwendungen dieses Elements werden anschließend als unbekannt angezeigt.', 'confirm-delete-custom', `data-id="${esc(id)}"`);
  if (a === 'confirm-delete-custom') { if (await commit(s => { s.customJumps = s.customJumps.filter(j => j.id !== id); }, 'Eigenes Element gelöscht.')) closeDialog(); return; }
  if (a === 'export') { await mutationQueue; download(`trampolin-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(createBackup(state), null, 2)); return toast('Backup-Datei erstellt.'); }
  if (a === 'import') return $('#import-file').click();
  if (a === 'confirm-import') { const pending = window.pendingImport; if (!pending) return; download(`trampolin-vor-import-${Date.now()}.json`, JSON.stringify(createBackup(state), null, 2)); if (await commit(s => { Object.assign(s, pending); }, 'Backup importiert.', false)) { window.pendingImport = null; closeDialog(); } return; }
});
document.addEventListener('keydown',event=>{
  const point=event.target.closest('[data-action="time-point"]');
  if (point && ['Enter',' '].includes(event.key)) { event.preventDefault(); point.dispatchEvent(new MouseEvent('click',{bubbles:true})); }
});
document.addEventListener('input', event => {
  if (event.target.id === 'jump-datetime') { const form=event.target.closest('form'); form.dataset.dateEdited='1'; const stamp=parseLocalTimestamp(event.target.value); $('.jump-auto-time span',form).textContent=stamp ? formatTimestamp(stamp) : 'Bitte Datum und Uhrzeit prüfen'; }

  if (event.target.id === 'catalogue-search') { search = event.target.value; $('#catalogue-results').innerHTML = catalogueResults(); }
  if (event.target.id === 'picker-search') renderPicker(event.target.value);
});
document.addEventListener('change', async event => {
  const el = event.target;
  if (el.dataset.practiceStatus) {
    const value=el.value,elementId=el.dataset.element;
    const ok=await commit(s => { const r=s.routines.find(r => r.id === el.dataset.practiceStatus); if (!r) return; if (!elementId) r.trainingStatus=value; else practiceTarget(r,elementId).status=value; },'Trainingsstatus gespeichert.');
    if (el.isConnected) { const r=state.routines.find(r => r.id === el.dataset.practiceStatus); const status=practiceTarget(r,elementId).status; el.value=status; el.className=`status-select ${status}`; }
    return ok;
  }
  if (el.dataset.goalStatus) { const value = el.value; return commit(s => { const g = s.goals.find(x => x.id === el.dataset.goalStatus); if (g) { setGoalStatus(s,g,value); } }); }
  if (el.id === 'import-file' && el.files[0]) {
    try {
      const file = el.files[0]; if (file.size > 5 * 1024 * 1024) throw new Error('Backup ist größer als 5 MB.');
      const incoming = validateBackup(JSON.parse(await file.text())); window.pendingImport = incoming;
      showDialog('Backup wiederherstellen?', `<p class="subtle">Die Datei enthält ${incoming.goals.length} Trainingsziele, ${incoming.routines.length} Sprungfolgen und ${incoming.customJumps.length} eigene Elemente sowie ${incoming.jumpTimes.length} Sprungzeit-Messungen.</p>${notice('Der Import ersetzt deine vorhandenen persönlichen Daten. Vorher wird automatisch eine Sicherungsdatei deines aktuellen Bestands erstellt.')}<div class="modal-actions">${btn('Abbrechen', 'close-modal', 'secondary')}${btn('Daten ersetzen und importieren', 'confirm-import')}</div>`);
    } catch (error) { toast(error.message || 'Diese Datei kann nicht importiert werden.'); }
    el.value = '';
  }
});
document.addEventListener('submit', async event => {
  const form = event.target; if (!form.dataset.form) return; event.preventDefault();
  if (form.dataset.saving === '1') return;
  form.dataset.saving = '1'; const submitButton = $('[type="submit"]', form); if (submitButton) submitButton.disabled = true;
  try {
  const f = new FormData(form); const type = form.dataset.form;
  if (type === 'jump-time') {
    const seconds=parseSeconds(f.get('seconds')),id=form.dataset.id,old=state.jumpTimes?.find(m=>m.id===id);
    const measuredAt=form.dataset.dateEdited ? parseLocalTimestamp(f.get('measuredAt')) : old?.measuredAt || new Date().toISOString();
    const error=$('[data-time-error]',form);
    if (seconds==null) { error.textContent='Bitte eine positive Dauer in Sekunden eingeben, zum Beispiel 18,45 (maximal drei Nachkommastellen).'; $('#jump-seconds',form).focus(); return; }
    if (!measuredAt) { error.textContent='Bitte ein gültiges Datum und eine Uhrzeit eingeben.'; $('details',form).open=true; $('#jump-datetime',form).focus(); return; }
    if (!id && (state.jumpTimes?.length || 0)>=10000) { error.textContent='Es können maximal 10.000 Messungen gespeichert werden.'; return; }
    const notes=f.get('notes').trim();
    const ok=await commit(s=>{ s.jumpTimes ||= []; const m=s.jumpTimes.find(m=>m.id===id); if (id && !m) return; if (m) Object.assign(m,{seconds,measuredAt,notes}); else s.jumpTimes.push({id:uid(),seconds,measuredAt,notes}); },id ? 'Messung aktualisiert.' : 'Messung gespeichert.');
    if (ok) { closeDialog(); if (!id && route()[0]==='times') $('#jump-seconds').focus({preventScroll:true}); }
  }
  if (type === 'practice') {
    const id=form.dataset.id,elementId=form.dataset.element,notes=f.get('notes').trim();
    if (await commit(s => { const r=s.routines.find(r => r.id === id); if (!r) return; if (!elementId) r.trainingNotes=notes; else practiceTarget(r,elementId).notes=notes; },'Notiz gespeichert.')) closeDialog();
  }
  if (type === 'goal') {
    const title = f.get('title').trim(); if (!title) return; const id = form.dataset.id;
    const ok = await commit(s => { const existing = s.goals.find(x => x.id === id); const values = { title, notes: f.get('notes').trim(), status: f.get('status'), completedAt: f.get('status') === 'mastered' ? new Date().toISOString() : null }; if (existing) { Object.assign(existing, values); if (existing.routineId) { const r=s.routines.find(r => r.id === existing.routineId); r.trainingStatus=values.status; r.trainingNotes=values.notes; } } else s.goals.push({ id: uid(), jumpId: form.dataset.jump || null, createdAt: new Date().toISOString(), ...values }); }, 'Trainingsziel gespeichert.'); if (ok) closeDialog();
  }
  if (type === 'routine') {
    const name = f.get('name').trim(); if (!name) return; let newId;
    const ok = await commit(s => { const existing = s.routines.find(x => x.id === form.dataset.id); if (existing) { existing.name = name; existing.notes = f.get('notes').trim(); existing.updatedAt = new Date().toISOString(); } else { newId = uid(); s.routines.push({ id: newId, name, notes: f.get('notes').trim(), elements: [], ruleId: RULE_ID, kind: 'voluntary', profile: 'planning', favorite: false, updatedAt: new Date().toISOString() }); } }, 'Sprungfolge gespeichert.'); if (ok) { closeDialog(); if (newId) location.hash = `routine/${newId}`; }
  }
  if (type === 'custom') {
    const name = f.get('name').trim(), raw = f.get('difficulty').trim().replace(',', '.'); if (!name) return;
    if (raw && (!/^\d{1,2}(\.\d)?$/.test(raw) || Number(raw) > 10)) { $('#form-error', form).textContent = 'Bitte einen Wert zwischen 0,0 und 10,0 in Zehntelschritten eingeben oder das Feld leer lassen.'; return; }
    const salto=f.get('salto').trim(), twist=f.get('twist').trim();
    if (salto && (!Number.isInteger(Number(salto)/90) || Number(salto)<0 || Number(salto)>1440) || twist && (!Number.isInteger(Number(twist)/180) || Number(twist)<0 || Number(twist)>5760)) { $('#form-error',form).textContent='Bitte Saltorotation in 90°-Schritten und Schraubenrotation in 180°-Schritten angeben oder leer lassen.'; return; }
    const ok = await commit(s => s.customJumps.push({ id: `custom-${uid()}`, custom: true, name_de: name, aliases: [], description: f.get('description').trim(), manualDifficultyTenths: raw ? Math.round(Number(raw) * 10) : null, discipline: 'TRA', fig_code: null, body_position:f.get('body_position') || null, rotation_direction:f.get('rotation_direction') || null, takeoff_position:f.get('takeoff_position') || null, landing_position:f.get('landing_position') || null, somersault_quarters:salto ? Number(salto)/90 : null, twist_half_turns_by_phase:twist ? [Number(twist)/180] : null }), 'Eigenes Element gespeichert.'); if (ok) closeDialog();
  }
  } finally { form.dataset.saving = ''; if (submitButton) submitButton.disabled = false; }
});
window.addEventListener('hashchange', () => { closeDialog(); render(); window.scrollTo(0, 0); $('#main').focus({ preventScroll: true }); });
window.addEventListener('online', () => state && render());
window.addEventListener('offline', () => state && render());
modal.addEventListener('click', event => { if (event.target === modal) { const rect = modal.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(); } });
async function start() {
  try {
    const response = await fetch('./data/catalogue.json'); if (!response.ok) throw new Error('Der Sprungkatalog konnte nicht geladen werden.');
    data = await response.json();
    for (const t of data.uebungsvorlagen) for (const note of t.notes || []) {
      if (/DTB|belegt|Ausschreibung|Lehrunterlagen|Veranstaltungsprofil/.test(note)) {
        templateNoteReplacements.set(note, note.startsWith('ToF') ? 'Die Sprungzeit geht bei dieser Vorlage nicht in die Wertung ein.' : note.startsWith('Diese Fassung der P2') ? 'Diese Vorlage besteht aus zehn Sprüngen.' : '');
      }
    }
    data.uebungsvorlagen = data.uebungsvorlagen.map(t => ({...t,
      notes: (t.notes || []).map(note => templateNoteReplacements.get(note) ?? note).filter(Boolean),
      group: t.group === 'DTB P-Übungen' ? 'P-Übungen' : t.group,
      name: t.display_name || t.name,
      description: t.id === 'adh-dhm-2027-p8' ? 'Salto zum Sitz und freie Barani-Körperform.' : t.description
    })); catalogue = data.sprungkatalog_startbestand; baseMap = new Map(catalogue.map(j => [j.id, j]));
    state = await store.open(); render();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  } catch (error) {
    $('#app').innerHTML = `<main class="initial" style="padding:25px"><h1>Der Planer konnte nicht starten</h1><p>${esc(error.message || 'Bitte die Seite erneut laden.')}</p><p class="subtle">Bestehende persönliche Daten wurden nicht überschrieben.</p><button class="button" onclick="location.reload()">Erneut versuchen</button></main>`;
  }
}
start();
