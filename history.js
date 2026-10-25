(function(root) {
  const copy = value => JSON.parse(JSON.stringify(value));
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function fork(branches, parentId, forkYear, simulation, id) {
    if (!branches[parentId]) throw new Error('Unknown parent history');
    if (branches[id]) throw new Error('History already exists');
    if (!Number.isFinite(Number(forkYear))) throw new Error('Invalid fork year');
    const parent = branches[parentId];
    const inherited = (parent.eras || []).filter(e => Number(e.year) < forkYear);
    const changed = (simulation.eras || []).filter(e => Number(e.year) >= forkYear);
    if (!changed.length) throw new Error('Simulation returned no world at or after the fork');
    return freeze({ ...copy(simulation), id, parentId, forkYear:Number(forkYear), contextId:parent.contextId, demo:Boolean(parent.demo),
      eras: copy([...inherited, ...changed].sort((a,b) => a.year-b.year)) });
  }
  function eraAt(eras, year) {
    const sorted = [...eras].sort((a,b) => a.year-b.year);
    return sorted.filter(e => Number(e.year) <= year).pop() || sorted[0] || null;
  }
  function interventionYear(text, explicitYear, selectedYear) {
    const namedYear = String(text || '').match(/\b(?:in|year)\s+(\d{3,4})\b/i);
    const year = explicitYear ?? (namedYear ? Number(namedYear[1]) : selectedYear);
    if (!Number.isFinite(Number(year))) throw new Error('An intervention year is required');
    return Number(year);
  }
  const api = { fork, eraAt, freeze, interventionYear };
  if (typeof module !== 'undefined') module.exports = api;
  else root.CausalHistory = api;
})(globalThis);
