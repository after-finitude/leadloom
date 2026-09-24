import { id, hash, stable, ensure, allowKeys } from './util.mjs';
import { DEFAULT_SETTINGS } from './defaults.mts';
import { validateSettings, validateRules } from './rules.mts';
import { CLOSED_STAGES, sqlList } from './domain.mts';

// Rule versions are immutable; existing leads keep theirs until staff recalculate.
export function publishRules(ctx, data, actor) {
  return ctx.store.tx(() => {
    validateRules(data);
    const s = ctx.workspace.settings();
    const content = { ...data, services: s.services, areas: s.areas, currency: s.currency };
    const version = (ctx.store.get('SELECT MAX(version) AS n FROM rule_versions')?.n || 0) + 1,
      rid = id();
    ctx.store.run(
      'INSERT INTO rule_versions(id,version,data,content_hash,created_at) VALUES(?,?,?,?,?)',
      rid,
      version,
      JSON.stringify(content),
      hash(stable(content)),
      ctx.clock()
    );
    ctx.audit.add(null, 'rules_published', { version }, { actor });
    return ctx.workspace.rules(rid);
  });
}

export function updateSettings(ctx, data, actor) {
  const allowed = Object.keys(DEFAULT_SETTINGS);
  allowKeys(data, [...allowed, 'revision']);
  const current = ctx.workspace.settings();
  ensure(
    data.revision === current.revision,
    'settings_conflict',
    'Settings were changed by another user. Reload first.',
    409
  );
  validateSettings(data);
  delete data.revision;
  return ctx.store.tx(() => {
    // Changing active-deal policy on existing ambiguous data would silently merge work.
    if (
      data.deduplication === 'one_active_per_contact' &&
      current.deduplication !== data.deduplication
    )
      ensure(
        !ctx.store.get(
          `SELECT contact_id FROM leads WHERE stage NOT IN (${sqlList(CLOSED_STAGES)}) GROUP BY contact_id HAVING COUNT(*)>1 LIMIT 1`
        ),
        'active_deal_conflict',
        'Close duplicate active deals before changing policy',
        409
      );
    ctx.store.run(
      'UPDATE settings SET data=?,revision=revision+1 WHERE id=1',
      JSON.stringify(data)
    );
    ctx.audit.add(null, 'settings_updated', { revision: current.revision + 1 }, { actor });
    return ctx.workspace.settings();
  });
}
