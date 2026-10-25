(function(root) {
  function createNavigator(load, commit, discard = () => {}) {
    let generation = 0;
    return async url => {
      const request = ++generation;
      if (!url) return false;
      try {
        const world = await load(url);
        if (request !== generation) { discard(world); return false; }
        commit(world);
        return true;
      } catch (_) { return false; }
    };
  }
  if (typeof module !== 'undefined') module.exports = { createNavigator };
  else root.WorldNavigation = { createNavigator };
})(globalThis);
