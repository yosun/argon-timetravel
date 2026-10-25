(function(root) {
  const copy = value => JSON.parse(JSON.stringify(value));
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function fork(branches, parentId, forkYear, simulation, id) {
    if (!branches[parentId]) throw new Error('Unknown parent history');
    if (branches[id]) throw new Error('History already exists');
    const parent = branches[parentId];
    const inherited = (parent.eras || []).filter(e => Number(e.year) < forkYear);
    const changed = (simulation.eras || []).filter(e => Number(e.year) >= forkYear);
    return freeze({ ...copy(simulation), id, parentId, forkYear,
      eras: copy([...inherited, ...changed].sort((a,b) => a.year-b.year)) });
  }
  function eraAt(eras, year) {
    const sorted = [...eras].sort((a,b) => a.year-b.year);
    return sorted.filter(e => Number(e.year) <= year).pop() || sorted[0] || null;
  }
  const api = { fork, eraAt, freeze };
  if (typeof module !== 'undefined') module.exports = api;
  else root.CausalHistory = api;
})(globalThis);
