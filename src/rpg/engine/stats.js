'use strict';

const STAT_CHANCE = { Easy: 0.05, Medium: 0.15, Hard: 0.30, Epic: 0.60 };

/**
 * Roll whether a stat boost is awarded for this completion.
 * Returns the stat name (e.g. 'str') or null.
 */
function rollStatGain(difficulty, statTarget) {
  if (!statTarget || statTarget === 'none') return null;
  const chance = STAT_CHANCE[difficulty] || 0.05;
  return Math.random() < chance ? statTarget : null;
}

/**
 * Map stat name to the DB column name.
 * 'int' → 'int_' because int is a SQLite keyword.
 */
function statColumn(stat) {
  return stat === 'int' ? 'int_' : stat;
}

/**
 * Check all locked unlockables against the current character state.
 * Marks newly earned ones as unlocked and returns them.
 */
function checkUnlockables(db, character) {
  const locked = db.prepare(`SELECT * FROM unlockables WHERE unlocked = 0`).all();
  const newly = [];

  for (const u of locked) {
    let earned = false;
    switch (u.unlock_type) {
      case 'level':  earned = character.level >= u.unlock_value; break;
      case 'xp':     earned = character.total_xp_earned >= u.unlock_value; break;
      case 'tasks':  earned = character.total_tasks_done >= u.unlock_value; break;
      case 'habits': earned = character.total_habits_done >= u.unlock_value; break;
      case 'streak': {
        const best = db.prepare(`SELECT MAX(best_streak) as m FROM habits WHERE active=1`).get();
        earned = (best.m || 0) >= u.unlock_value;
        break;
      }
    }
    if (earned) {
      db.prepare(`
        UPDATE unlockables SET unlocked=1, unlocked_at=datetime('now') WHERE id=?
      `).run(u.id);
      newly.push(u);
    }
  }
  return newly;
}

module.exports = { rollStatGain, statColumn, checkUnlockables };
