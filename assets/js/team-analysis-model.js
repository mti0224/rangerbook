/* Pure team analysis, keyed exclusively by native V2 codes. Shared by both charts. */
(() => {
  'use strict';
  const slots = ['WEAPON', 'ARMOR', 'ACC'];
  const elements = ['FIRE', 'WATER', 'TREE', 'LIGHT', 'DARK'];
  const roles = ['INT', 'AGI', 'STR'];
  const key = code => `EQUIP:GEAR_FILTER_${code}_nm`;
  const metrics = [
    {id:'evade', code:'SKLAVD_PROB_MUL', stat:'skillDodgeChancePercent', max:100},
    {id:'resistance', code:'SKLRE_PROB_MUL', stat:'skillResistancePercent', max:100},
    {id:'mineral', code:'SUMMON_ENGY_MUL', max:78, direction:-1},
    {id:'respawn', code:'PRD_SPE_MUL', max:48, direction:-1},
    {id:'surehit', code:'CLN_SKLAVD_PROB_MUL', stat:'skillSurehitChancePercent', max:24},
    {id:'element', code:'EATK_MUL', max:250}
  ];
  const finite = value => value !== null && value !== undefined && value !== '' && typeof value !== 'boolean' && Number.isFinite(Number(value));
  const gearCode = g => typeof g === 'string' ? g : g?.itemCode || g?.equipItemCode || g?.code;
  function conditionMatches(condition, ranger) {
    if (!condition || typeof condition !== 'object') return null;
    if (condition.kind === 'always') return true;
    // Unknown/extended conditions are never silently treated as satisfied.
    if (Object.keys(condition).some(k => !['kind','value'].includes(k))) return null;
    if (condition.kind === 'rangerType') {
      if (roles.includes(condition.value)) return ranger.roleType === condition.value;
      if (elements.includes(condition.value)) return ranger.elementType === condition.value;
    }
    return null;
  }
  function create(catalogs) {
    const rangers = new Map(catalogs.rangers.map(r => [r.rangerCode,r]));
    const equipment = new Map(catalogs.equipment.map(g => [g.equipCode,g]));
    const effects = new Map(catalogs.effects.map(e => [String(e.attributeId),e.optionKey]));
    const abilities = new Map(catalogs.abilities.map(a => [a.abilityCode,a]));
    function slotInfo(unit, slot) {
      const actual = (unit.equipMap || unit.equipment || {})[slot];
      return {actual, definition:equipment.get(gearCode(actual))};
    }
    function advanced(unit, slot, ranger = rangers.get(unit.unitCode)) {
      const {actual,definition} = slotInfo(unit,slot);
      if (!actual) return {ok:false,reason:'unequipped'};
      if (!definition) return {ok:false,reason:'pending'};
      if (definition.starGrade <= 6) return {ok:false,reason:'lowStar'};
      const high = definition.highLevelOptions;
      if (!high || !actual.attr4No || Number(actual.attr4No) === 0) return {ok:false,reason:'noAdvanced'};
      const optionKey = actual.attr4OptionKey || effects.get(String(actual.attr4No));
      if (!optionKey) return {ok:false,reason:'pending'};
      const allowed = [high.defaultOption,...(high.switchOptions || [])].filter(Boolean);
      if (!allowed.some(o => o.optionKey === optionKey)) return {ok:false,reason:'noAdvanced'};
      // attr4Condition comes from the *selected* official attribute row, not an item name.
      const matches = ranger && conditionMatches(actual.attr4Condition,ranger);
      if (matches === null || matches === undefined) return {ok:false,reason:'pending',optionKey};
      if (!matches) return {ok:false,reason:'condition',optionKey};
      return {ok:true,reason:'matched',optionKey,value:finite(actual.attr4Value) && actual.attr4Unit === 'PERCENT' ? Number(actual.attr4Value) : null};
    }
    function isFlyer(unit, ranger) {
      return [...(ranger.abilityCodes || []),unit.awakeAbilityCode].filter(Boolean)
        .some(code => abilities.get(code)?.triggerEffects?.some(e => e.aptitudeCode === 'FLIGHT'));
    }
    function eligibleFor(unit, ranger, metric) {
      // Unknown Rangers remain pending in the radar rather than disappearing.
      if (!ranger) return true;
      if (['surehit','element'].includes(metric) && isFlyer(unit,ranger)) return false;
      return metric !== 'element' || ['INT','AGI'].includes(ranger.roleType);
    }
    function basicOptions(unit,slot) {
      const {actual,definition} = slotInfo(unit,slot);
      if (!actual) return [];
      // Old snapshots cannot supply real rolled/enhanced values. Catalog ranges are not player values.
      return Array.isArray(actual.normalOptions) && actual.normalOptions.length === definition?.normalOptions?.length
        ? actual.normalOptions : (definition?.normalOptions || []).map(o => ({optionKey:o.optionKey,value:null}));
    }
    function surehit(unit,ranger) {
      const {actual,definition} = slotInfo(unit,'WEAPON');
      if (!actual) return {ok:false,reason:'unequipped'};
      if (!definition) return {ok:false,reason:'pending'};
      const options = basicOptions(unit,'WEAPON');
      const codes = options.map(o => o.optionKey);
      const attack = ranger.roleType === 'STR' ? ['HP_MUL'] : ranger.roleType === 'INT' ? ['ALL_ATK_MUL'] : ['ALL_ATK_MUL','GATK_MUL'];
      const ok = codes.length === 3 && codes.includes(key('PRD_SPE_MUL')) && codes.includes(key('CLN_SKLAVD_PROB_MUL')) && attack.some(c => codes.includes(key(c)));
      return {ok,reason:ok ? 'matched' : 'combination'};
    }
    function elemental(unit,ranger) {
      const results = slots.map(s => advanced(unit,s,ranger));
      const ok = results.some(r => r.ok && r.optionKey === key('EATK_MUL'));
      return {ok,reason:ok ? 'matched' : results.some(r => r.reason === 'pending') ? 'pending' : 'noElement'};
    }
    function unitMetrics(unit,ranger) {
      return metrics.map(metric => {
        if (!eligibleFor(unit,ranger,metric.id)) return undefined;
        let total = metric.stat ? Number(ranger.stats?.[metric.stat] ?? 0) : 0;
        let complete = Number.isFinite(total);
        for (const slot of slots) {
          const {actual,definition} = slotInfo(unit,slot);
          if (actual && !definition) complete = false;
          if (metric.id !== 'element') {
            const options = basicOptions(unit,slot);
            if (actual && (!definition || options.length !== definition.normalOptions.length)) complete = false;
            for (const option of options) if (option.optionKey === key(metric.code)) {
              if (finite(option.value)) total += Number(option.value) * (metric.direction || 1);
              else complete = false;
            }
          }
          const high = advanced(unit,slot,ranger);
          if (high.reason === 'pending' && (!high.optionKey || high.optionKey === key(metric.code))) complete = false;
          if (high.ok && high.optionKey === key(metric.code)) {
            if (high.value === null) complete = false;
            else total += high.value * (metric.direction || 1);
          }
        }
        // Enhancements unlock at talent stages 2, 3 and 4; stage 1 unlocks the major talent.
        (ranger.talents?.enhancements || []).forEach((enhancement,index) => {
          if (enhancement.effectCode === metric.code && !finite(unit.talentGrade)) complete = false;
          if (Number(unit.talentGrade) >= index + 2 && enhancement.effectCode === metric.code) {
            total += Number(enhancement.value) * (enhancement.unit === 'PERCENT_FACTOR' ? 100 : 1) * (metric.direction || 1);
          }
        });
        if (!complete) return null;
        return ['evade','resistance'].includes(metric.id) ? Math.min(100,total) : total;
      });
    }
    function analyze(units) {
      const members = units.map((unit,index) => ({unit,index,ranger:rangers.get(unit.unitCode)}));
      const values = members.map(m => m.ranger ? unitMetrics(m.unit,m.ranger) : metrics.map(() => null));
      const radar = metrics.map((metric,i) => {
        const eligible = members.filter(m => eligibleFor(m.unit,m.ranger,metric.id));
        const numbers = eligible.map(m => values[m.index][i]);
        const complete = numbers.every(finite);
        const average = numbers.length && complete ? numbers.reduce((a,b) => a+b,0)/numbers.length : null;
        return {...metric,average,count:numbers.length,pending:numbers.length > 0 && !complete,
          normalized:average === null ? null : Math.max(0,Math.min(1,average/metric.max))};
      });
      function rows(tab) {
        const categories = slots.includes(tab) ? [...elements,...roles] : tab === 'surehit' ? roles : elements;
        return categories.map((category,order) => {
          const eligible = members.filter(({unit,ranger}) => ranger && (roles.includes(category) ? ranger.roleType === category : ranger.elementType === category)
            && eligibleFor(unit,ranger,tab));
          const entries = eligible.map(m => ({...m,...(slots.includes(tab) ? advanced(m.unit,tab,m.ranger) : tab === 'surehit' ? surehit(m.unit,m.ranger) : elemental(m.unit,m.ranger))}));
          const numerator = entries.filter(e => e.ok).length;
          return {category,order,entries,numerator,denominator:entries.length,ratio:entries.length ? numerator/entries.length : null};
        }).sort((a,b) => (b.ratio ?? -1) - (a.ratio ?? -1) || a.order-b.order);
      }
      return {radar,tabs:Object.fromEntries([...slots,'surehit','element'].map(tab => [tab,rows(tab)]))};
    }
    return {analyze,advanced};
  }
  const api = {create,metrics,elements,roles,conditionMatches};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.RangerbookTeamAnalysisModel = api;
})();
