export const SCHEMA_VERSION = 1;
export const RULE_ID = 'fig-tra-2025-2028-pub-2025-06-02';
export const STATUSES = ['planned', 'working', 'mastered', 'paused', 'practice'];
export const PROFILES = ['planning', 'women', 'men', 'mixed_syn', 'AG1', 'AG2', 'Junior', 'AG3'];
export const uid = () => globalThis.crypto.randomUUID();
export const formatD = n => n == null ? '—' : (n / 10).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const normalize = s => String(s ?? '').toLowerCase().replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/°/g, 'o').replace(/\s+/g, ' ').trim();
export function emptyState() {
  return { schemaVersion: SCHEMA_VERSION, goals: [], routines: [], customJumps: [], jumpTimes: [], settings: { hideMastered: false }, updatedAt: new Date().toISOString() };
}
export function calculateElement(jump) {
  if (!jump || jump.custom) return { value: jump?.manualDifficultyTenths ?? null, manual: !!jump?.custom, components: null };
  const q = jump.somersault_quarters;
  const phases = jump.twist_half_turns_by_phase;
  if (!Number.isInteger(q) || q < 0 || q > 16 || !Array.isArray(phases) || phases.some(x => !Number.isInteger(x) || x < 0)) return { value: null, components: null };
  const twist = phases.reduce((a, b) => a + b, 0);
  // No-rotation named elements and straight rebounds require their element identity.
  if (q === 0 && twist === 0) {
    const named = ['tuck', 'pike', 'straddle_pike', 'seat'].includes(jump.body_position) || jump.takeoff_position === 'seat';
    const value = named ? 1 : jump.id === 'tra-streck' ? 0 : null;
    return { value, components: value == null ? null : { Grundelement: value } };
  }
  const complete = Math.floor(q / 4);
  const salto = [0, 5, 10, 16, 22][complete] + q % 4;
  const position = ['pike', 'straight'].includes(jump.body_position) ? (q >= 8 ? complete : q >= 4 && twist === 0 ? 1 : 0) : 0;
  const backward = jump.rotation_direction === 'backward' ? (q >= 8 && q <= 11 ? 1 : q >= 12 && q <= 15 ? 2 : q === 16 ? 3 : 0) : 0;
  const twistBonus = complete === 2 ? Math.max(0, twist - 4) : complete === 3 ? Math.max(0, twist - 2) * 2 : complete === 4 ? twist * 2 : 0;
  const components = { Saltorotation: salto, Schraubenrotation: twist, Körperposition: position, Rückwärtsbonus: backward, Schraubenbonus: twistBonus };
  const value = Object.values(components).reduce((a, b) => a + b, 0);
  const ref = jump.difficulty?.reference_value_tenths;
  if (Number.isInteger(ref) && value !== ref) return { value: null, components, mismatch: true };
  return { value, components };
}
export function repetitionKey(jump) {
  if (!jump || jump.custom) return null;
  const q = jump.somersault_quarters;
  const phases = jump.twist_half_turns_by_phase;
  const twist = phases.reduce((a, b) => a + b, 0);
  const shapeIsDifferent = (q >= 3 && twist <= 1) || (q > 5 && twist >= 2) || (q === 0 && twist === 0);
  const phaseKey = q <= 6 ? String(twist) : phases.join(':');
  return [jump.rotation_direction, q, phaseKey, shapeIsDifferent ? jump.body_position : 'any', jump.takeoff_position, jump.landing_position].join('|');
}
export function evaluateRoutine(routine, lookup) {
  const warnings = [];
  const seen = new Set();
  let subtotal = 0, unknown = false, manual = false, triples = 0;
  const caps = { AG1: 17, AG2: 21, Junior: 21, AG3: 22 };
  const junior = Object.hasOwn(caps, routine.profile);
  const elements = routine.elements.map((element, index) => {
    const jump = lookup(element.jumpId);
    const result = calculateElement(jump);
    const key = repetitionKey(jump);
    const repeated = key != null && seen.has(key);
    if (key) seen.add(key);
    const q = jump?.somersault_quarters;
    const forbidden = junior && (q >= 16 || (routine.profile === 'AG1' && q >= 12));
    const rebound = jump?.id === 'tra-streck';
    const capped = result.value != null && junior && result.value > caps[routine.profile];
    const scored = result.value == null ? null : repeated ? 0 : junior ? Math.min(result.value, caps[routine.profile]) : result.value;
    if (scored == null) unknown = true; else subtotal += scored;
    if (result.manual) manual = true;
    if (!repeated && q >= 12 && !result.manual) triples++;
    if (index > 0) {
      const prior = lookup(routine.elements[index - 1].jumpId);
      if (prior?.landing_position && jump?.takeoff_position && prior.landing_position !== jump.takeoff_position) warnings.push({ severity: 'error', text: `Position ${index + 1}: Ausgangsposition passt nicht zur vorherigen Landung.` });
    }
    if (repeated) warnings.push({ severity: 'warn', text: `Position ${index + 1}: geplante Sprungwiederholung; D-Anrechnung 0,0.` });
    if (forbidden) warnings.push({ severity: 'error', text: `Position ${index + 1}: in diesem FIG-Nachwuchsprofil verbotene Saltorotation.` });
    if (rebound) warnings.push({ severity: 'error', text: `Position ${index + 1}: Strecksprung ist in einer FIG-Kürübung ein Zwischensprung und unterbricht die Übung.` });
    if (result.value == null) warnings.push({ severity: 'error', text: `Position ${index + 1}: D-Wert nicht belegbar.` });
    if (capped) warnings.push({ severity: 'warn', text: `Position ${index + 1}: D auf ${formatD(caps[routine.profile])} begrenzt.` });
    return { ...element, jump, ...result, scored, repeated, capped, forbidden, rebound };
  });
  const targetElementCount = routine.kind === 'compulsory' && routine.targetElementCount === 5 ? 5 : 10;
  const complete = elements.length === targetElementCount;
  if (!complete) warnings.unshift({ severity: 'warn', text: `${elements.length} von ${targetElementCount} Elementen – Sprungfolge ist ein Entwurf.` });
  if (elements.length > targetElementCount) warnings.push({ severity: 'error', text: `Mehr als ${targetElementCount} Elemente; die vorgesehene Übungslänge ist überschritten.` });
  if (elements.length && elements[0].jump?.takeoff_position !== 'feet') warnings.push({ severity: 'error', text: 'Die Übung muss aus dem Stand beginnen.' });
  if (complete && elements.at(-1).jump?.landing_position !== 'feet') warnings.push({ severity: 'error', text: 'Eine vollständige Übung muss auf den Füßen enden.' });
  const threshold = { women: 2, men: 5, mixed_syn: 2 }[routine.profile];
  const unresolvedBonus = threshold == null && !junior && triples > 2;
  const bonus = threshold != null && complete && targetElementCount === 10 ? Math.max(0, triples - threshold) * 3 : 0;
  if (unresolvedBonus) warnings.push({ severity: 'warn', text: 'Für den möglichen Dreifachsalto-Bonus ein Frauen-, Männer- oder Mixed-Profil wählen.' });
  if (manual) warnings.push({ severity: 'warn', text: 'Enthält eigene D-Angaben; die Summe ist benutzerdefiniert.' });
  if (routine.kind !== 'voluntary') warnings.push({ severity: 'warn', text: 'Pflichtentwurf: Die tatsächliche D-Anrechnung richtet sich nach der Ausschreibung. Angezeigt wird die Planungssumme.' });
  const invalid = warnings.some(w => w.severity === 'error');
  return { elements, targetElementCount, subtotal: unknown ? null : subtotal, bonus, total: unknown ? null : subtotal + bonus, complete, manual, unresolvedBonus, invalid, warnings, label: unknown ? 'D-Wert offen' : manual ? 'Eigene Planungssumme' : routine.kind !== 'voluntary' || !complete || invalid || unresolvedBonus ? 'D-Planungssumme' : 'Geplante D-Anrechnung' };
}
export function createRoutineFromTemplate(template) {
  return { id: uid(), name: template.display_name || template.name, kind: 'compulsory', profile: 'planning', ruleId: RULE_ID, favorite: false,
    templateId: template.id, targetElementCount: template.target_element_count || template.elements.length,
    notes: (template.notes || []).join('\n') || '',
    elements: template.elements.map(e => ({ id: uid(), jumpId: e.jump_id || e.allowed_jump_ids[0] })), updatedAt: new Date().toISOString() };
}
export function matchesSearch(jump, query) {
  const q = normalize(query);
  if (!q) return true;
  const text = normalize([jump.name_de, ...(jump.aliases || []), jump.fig_code, jump.description].join(' '));
  const near = (a, b) => {
    if (Math.abs(a.length - b.length) > 1 || a.length < 4) return false;
    if (a.length === b.length) {
      const diffs = [...a].map((c, i) => c === b[i] ? -1 : i).filter(i => i >= 0);
      return diffs.length <= 1 || diffs.length === 2 && diffs[1] === diffs[0] + 1 && a[diffs[0]] === b[diffs[1]] && a[diffs[1]] === b[diffs[0]];
    }
    const [long, short] = a.length > b.length ? [a, b] : [b, a];
    let i = 0; while (i < short.length && long[i] === short[i]) i++;
    return long.slice(i + 1) === short.slice(i);
  };
  return q.split(' ').every(part => text.includes(part) || text.split(/[\s,;·]+/).some(word => near(part, word))) || text.replace(/\s/g, '').includes(q.replace(/\s/g, ''));
}
const fail = () => { throw new Error('Die Datei enthält ungültige oder inkompatible Trainingsdaten.'); };
const training = x => {
  if (x.status != null && !STATUSES.includes(x.status) || !str(x.notes ?? '')) fail();
  return { status: x.status || 'planned', notes: x.notes || '' };
};
const str = (s, max = 2000) => typeof s === 'string' && s.length <= max;
export function validateBackup(input) {
  const state = input?.format === 'trampolin-trainer-backup' ? input.data : input;
  if (!state || state.schemaVersion !== SCHEMA_VERSION || !['goals', 'routines', 'customJumps'].every(k => Array.isArray(state[k]) && state[k].length <= 10000)) fail();
  const unique = rows => { const ids = new Set(); for (const x of rows) { if (!str(x.id, 100) || !x.id || ids.has(x.id)) fail(); ids.add(x.id); } };
  unique(state.goals); unique(state.routines); unique(state.customJumps);
  const goals = state.goals.map(x => {
    if (!str(x.title, 200) || !x.title.trim() || !STATUSES.includes(x.status) || !str(x.notes ?? '') || !(x.jumpId == null || str(x.jumpId, 100)) || !(x.routineId == null || str(x.routineId, 100)) || x.routineId && x.jumpId) fail();
    return { id: x.id, title: x.title, jumpId: x.jumpId || null, routineId: x.routineId || null, status: x.status, notes: x.notes || '', createdAt: str(x.createdAt, 100) ? x.createdAt : new Date().toISOString(), completedAt: str(x.completedAt, 100) ? x.completedAt : null };
  });
  const routines = state.routines.map(x => {
    if (!str(x.name, 200) || !x.name.trim() || !PROFILES.includes(x.profile) || !['voluntary', 'compulsory'].includes(x.kind) || x.ruleId !== RULE_ID || !str(x.notes ?? '') || !Array.isArray(x.elements) || x.elements.length > 100) fail();
    if (x.targetElementCount != null && ![5, 10].includes(x.targetElementCount) || x.templateId != null && !str(x.templateId, 100)) fail();
    unique(x.elements);
    const elements = x.elements.map(e => { if (!str(e.jumpId, 100) || !e.jumpId) fail(); return { id: e.id, jumpId: e.jumpId, ...training(e) }; });
    if (x.transitions != null && (!Array.isArray(x.transitions) || x.transitions.length > 99)) fail();
    const seenTransitions = new Set();
    const transitions = (x.transitions || []).map(t => {
      if (!str(t.fromId, 100) || !str(t.toId, 100)) fail();
      const key = JSON.stringify([t.fromId,t.toId]);
      if (seenTransitions.has(key)) fail(); seenTransitions.add(key);
      if (!elements.some((e,i) => e.id === t.fromId && elements[i+1]?.id === t.toId)) fail();
      return { fromId:t.fromId, toId:t.toId, ...training(t) };
    });
    const overall = training({status:x.trainingStatus,notes:x.trainingNotes});
    return { trainingStatus:overall.status, trainingNotes:overall.notes, transitions, id: x.id, name: x.name, profile: x.profile, kind: x.kind, ruleId: RULE_ID, notes: x.notes || '', favorite: !!x.favorite, elements, targetElementCount:x.targetElementCount || 10, templateId:x.templateId || null, updatedAt: str(x.updatedAt, 100) ? x.updatedAt : new Date().toISOString() };
  });
  const linked = new Set();
  for (const g of goals) if (g.routineId) {
    const r = routines.find(r => r.id === g.routineId);
    if (!r || linked.has(r.id)) fail(); linked.add(r.id);
    g.title=r.name; g.status=r.trainingStatus; g.notes=r.trainingNotes;
    g.completedAt=g.status === 'mastered' ? g.completedAt : null;
  }
  const customJumps = state.customJumps.map(x => {
    if (!x.id.startsWith('custom-') || !str(x.name_de, 200) || !x.name_de.trim() || !str(x.description ?? '') || !(x.manualDifficultyTenths == null || Number.isInteger(x.manualDifficultyTenths) && x.manualDifficultyTenths >= 0 && x.manualDifficultyTenths <= 100)) fail();
    const optionalChoice = (value, choices) => { if (value != null && !choices.includes(value)) fail(); return value ?? null; };
    const body_position = optionalChoice(x.body_position, ['tuck','pike','straight','straddle_pike','seat','custom']);
    const rotation_direction = optionalChoice(x.rotation_direction, ['forward','backward','none']);
    const takeoff_position = optionalChoice(x.takeoff_position, ['feet','seat','front','back']);
    const landing_position = optionalChoice(x.landing_position, ['feet','seat','front','back']);
    if (x.somersault_quarters != null && (!Number.isInteger(x.somersault_quarters) || x.somersault_quarters < 0 || x.somersault_quarters > 16)) fail();
    const phases = x.twist_half_turns_by_phase;
    if (phases != null && (!Array.isArray(phases) || phases.length < 1 || phases.length > 4 || phases.some(n => !Number.isInteger(n) || n < 0 || n > 32) || phases.reduce((a,b) => a+b,0) > 32)) fail();
    return { id: x.id, name_de: x.name_de, aliases: [], custom: true, description: x.description || '', manualDifficultyTenths: x.manualDifficultyTenths ?? null, discipline: 'TRA', fig_code: null, rotation_direction, body_position, takeoff_position, landing_position, somersault_quarters:x.somersault_quarters ?? null, twist_half_turns_by_phase:phases ? [...phases] : null };
  });
  if (state.jumpTimes != null && (!Array.isArray(state.jumpTimes) || state.jumpTimes.length > 10000)) fail();
  unique(state.jumpTimes || []);
  const jumpTimes=(state.jumpTimes || []).map(m => {
    if (!Number.isFinite(m.seconds) || m.seconds <= 0 || m.seconds > 86400 || !str(m.notes ?? '') || !str(m.measuredAt,100) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(m.measuredAt) || !Number.isFinite(Date.parse(m.measuredAt))) fail();
    const measuredAt=new Date(m.measuredAt).toISOString();
    if (measuredAt.slice(0,19) !== m.measuredAt.slice(0,19)) fail();
    return {id:m.id,seconds:m.seconds,measuredAt,notes:m.notes || ''};
  });
  return { schemaVersion: SCHEMA_VERSION, goals, routines, customJumps, jumpTimes, settings: { hideMastered: !!state.settings?.hideMastered }, updatedAt: new Date().toISOString() };
}
export function createBackup(state) {
  return { format: 'trampolin-trainer-backup', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: validateBackup(state) };
}

// Keep ratings attached to occurrences; remove connections as soon as they change.
export function reconcileTraining(state, previous = null) {
  for (const r of state.routines) {
    const before = previous?.routines.find(x => x.id === r.id);
    const changed = new Set();
    for (const e of r.elements) {
      const old = before?.elements.find(x => x.id === e.id);
      if (old && old.jumpId !== e.jumpId) { e.status='planned'; e.notes=''; changed.add(e.id); }
      e.status ??= 'planned'; e.notes ??= '';
    }
    r.trainingStatus ??= 'planned'; r.trainingNotes ??= '';
    r.transitions = (r.transitions || []).filter(t => !changed.has(t.fromId) && !changed.has(t.toId) && r.elements.some((e,i) => e.id === t.fromId && r.elements[i+1]?.id === t.toId));
  }
  state.goals = state.goals.filter(g => !g.routineId || state.routines.some(r => r.id === g.routineId));
  for (const g of state.goals) if (g.routineId) {
    const r = state.routines.find(r => r.id === g.routineId);
    Object.assign(g, {title:r.name, status:r.trainingStatus, notes:r.trainingNotes});
    g.completedAt = g.status === 'mastered' ? g.completedAt || new Date().toISOString() : null;
  }
}
export function setGoalStatus(state, goal, status) {
  goal.status=status; goal.completedAt=status === 'mastered' ? new Date().toISOString() : null;
  if (goal.routineId) state.routines.find(r => r.id === goal.routineId).trainingStatus=status;
}
