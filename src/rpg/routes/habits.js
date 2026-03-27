'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { applyXP, baseRewards } = require('../engine/xp');
const { streakMultiplier, computeNewStreak, todayString } = require('../engine/streaks');
const { rollStatGain, statColumn, checkUnlockables } = require('../engine/stats');

// GET /api/rpg/habits
router.get('/', (req, res) => {
  const showAll = req.query.all === 'true';
  const habits = showAll
    ? db.prepare(`SELECT * FROM habits ORDER BY completed_today ASC, created_at DESC`).all()
    : db.prepare(`SELECT * FROM habits WHERE active=1 ORDER BY completed_today ASC, created_at DESC`).all();
  res.json(habits);
});

// POST /api/rpg/habits
router.post('/', (req, res) => {
  const { title, notes, difficulty, stat_target, frequency } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const diff = ['Easy','Medium','Hard','Epic'].includes(difficulty) ? difficulty : 'Easy';
  const stat = ['none','str','int','vit','dex','cha'].includes(stat_target) ? stat_target : 'none';
  const freq = frequency === 'weekly' ? 'weekly' : 'daily';
  const result = db.prepare(`
    INSERT INTO habits (title, notes, difficulty, stat_target, frequency)
    VALUES (?, ?, ?, ?, ?)
  `).run(title, notes || '', diff, stat, freq);
  const habit = db.prepare(`SELECT * FROM habits WHERE id=?`).get(result.lastInsertRowid);
  res.status(201).json(habit);
});

// PATCH /api/rpg/habits/:id
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const habit = db.prepare(`SELECT * FROM habits WHERE id=?`).get(id);
  if (!habit) return res.status(404).json({ error: 'Habit not found' });
  const { title, notes, difficulty, stat_target, frequency, active } = req.body;
  const updates = [];
  const params = [];
  if (title      !== undefined) { updates.push('title=?');      params.push(String(title).slice(0,200)); }
  if (notes      !== undefined) { updates.push('notes=?');      params.push(String(notes)); }
  if (difficulty !== undefined && ['Easy','Medium','Hard','Epic'].includes(difficulty)) {
    updates.push('difficulty=?'); params.push(difficulty);
  }
  if (stat_target !== undefined && ['none','str','int','vit','dex','cha'].includes(stat_target)) {
    updates.push('stat_target=?'); params.push(stat_target);
  }
  if (frequency !== undefined && ['daily','weekly'].includes(frequency)) {
    updates.push('frequency=?'); params.push(frequency);
  }
  if (active !== undefined) { updates.push('active=?'); params.push(active ? 1 : 0); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(id);
  db.prepare(`UPDATE habits SET ${updates.join(', ')} WHERE id=?`).run(...params);
  res.json(db.prepare(`SELECT * FROM habits WHERE id=?`).get(id));
});

// DELETE /api/rpg/habits/:id
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`UPDATE habits SET active=0 WHERE id=?`).run(id);
  res.json({ deleted: true });
});

// POST /api/rpg/habits/:id/complete
router.post('/:id/complete', (req, res) => {
  const id = Number(req.params.id);
  const habit = db.prepare(`SELECT * FROM habits WHERE id=? AND active=1`).get(id);
  if (!habit) return res.status(404).json({ error: 'Habit not found' });
  if (habit.completed_today) return res.status(409).json({ error: 'Already completed today' });

  const today = todayString();
  const { xp: baseXP, coins: baseCoins } = baseRewards(habit.difficulty);
  const newStreak = computeNewStreak(habit.streak, habit.last_completed_date, today);
  const { xpMult, coinBonus } = streakMultiplier(newStreak);
  const xpEarned    = Math.round(baseXP * xpMult);
  const coinsEarned = baseCoins + coinBonus;
  const boostedStat = rollStatGain(habit.difficulty, habit.stat_target);
  const streakBonus = newStreak >= 3;

  const doComplete = db.transaction(() => {
    // Record completion
    db.prepare(`INSERT OR IGNORE INTO habit_completions (habit_id, date) VALUES (?,?)`).run(id, today);
    // Update habit
    const bestStreak = Math.max(habit.best_streak, newStreak);
    db.prepare(`
      UPDATE habits SET streak=?, best_streak=?, last_completed_date=?, completed_today=1 WHERE id=?
    `).run(newStreak, bestStreak, today, id);
    // Update character
    const char = db.prepare(`SELECT * FROM character WHERE id=1`).get();
    const { level, xp, xp_to_next, levelsGained } = applyXP(char, xpEarned);
    const statUpdate = boostedStat ? `, ${statColumn(boostedStat)}=${statColumn(boostedStat)}+1` : '';
    db.prepare(`
      UPDATE character
      SET xp=?, xp_to_next=?, level=?,
          coins=coins+?,
          total_xp_earned=total_xp_earned+?,
          total_habits_done=total_habits_done+1
          ${statUpdate}
      WHERE id=1
    `).run(xp, xp_to_next, level, coinsEarned, xpEarned);
    // Log level-up events
    for (const lvl of levelsGained) {
      db.prepare(`INSERT INTO activity_log (event_type,description,xp_delta,coin_delta,meta) VALUES (?,?,0,0,?)`
      ).run('level_up', `Reached level ${lvl}!`, JSON.stringify({ level: lvl }));
    }
    // Log habit completion
    const desc = streakBonus
      ? `Completed "${habit.title}" (${newStreak}-day streak 🔥) +${xpEarned} XP +${coinsEarned} coins`
      : `Completed "${habit.title}" +${xpEarned} XP +${coinsEarned} coins`;
    db.prepare(`INSERT INTO activity_log (event_type,description,xp_delta,coin_delta,meta) VALUES (?,?,?,?,?)`
    ).run('habit_complete', desc, xpEarned, coinsEarned, JSON.stringify({ habit_id: id, streak: newStreak }));
    // Check unlockables
    const updatedChar = db.prepare(`SELECT * FROM character WHERE id=1`).get();
    const newUnlocks = checkUnlockables(db, updatedChar);
    for (const u of newUnlocks) {
      db.prepare(`INSERT INTO activity_log (event_type,description,xp_delta,coin_delta,meta) VALUES (?,?,0,0,?)`
      ).run('unlockable_earned', `Unlocked: ${u.title} ${u.icon}`, JSON.stringify({ unlockable_id: u.id }));
    }
    return { levelsGained, newUnlocks, updatedChar };
  });

  const { levelsGained, newUnlocks, updatedChar } = doComplete();
  const updatedHabit = db.prepare(`SELECT * FROM habits WHERE id=?`).get(id);

  res.json({
    habit: updatedHabit,
    character: { ...updatedChar, int: updatedChar.int_, xp_percent: Math.floor((updatedChar.xp / updatedChar.xp_to_next) * 100) },
    rewards: {
      xp_earned:          xpEarned,
      coins_earned:       coinsEarned,
      streak_bonus:       streakBonus,
      stat_boosted:       boostedStat,
      leveled_up:         levelsGained.length > 0,
      new_levels:         levelsGained,
      unlockables_earned: newUnlocks.map(u => ({ id: u.id, title: u.title, icon: u.icon, description: u.description })),
    },
  });
});

// POST /api/rpg/habits/:id/uncomplete
router.post('/:id/uncomplete', (req, res) => {
  const id = Number(req.params.id);
  const habit = db.prepare(`SELECT * FROM habits WHERE id=? AND active=1`).get(id);
  if (!habit) return res.status(404).json({ error: 'Habit not found' });
  if (!habit.completed_today) return res.status(409).json({ error: 'Not completed today' });

  const today = todayString();
  const { xp: baseXP, coins: baseCoins } = baseRewards(habit.difficulty);
  const { xpMult, coinBonus } = streakMultiplier(habit.streak);
  const xpEarned    = Math.round(baseXP * xpMult);
  const coinsEarned = baseCoins + coinBonus;

  const doUncomplete = db.transaction(() => {
    db.prepare(`DELETE FROM habit_completions WHERE habit_id=? AND date=?`).run(id, today);
    const prevStreak = habit.streak > 1 ? habit.streak - 1 : 0;
    db.prepare(`
      UPDATE habits SET streak=?, completed_today=0, last_completed_date=NULL WHERE id=?
    `).run(prevStreak, id);
    const char = db.prepare(`SELECT * FROM character WHERE id=1`).get();
    const newXP    = Math.max(0, char.xp - xpEarned);
    const newCoins = Math.max(0, char.coins - coinsEarned);
    const newTotalHabits = Math.max(0, char.total_habits_done - 1);
    db.prepare(`UPDATE character SET xp=?, coins=?, total_habits_done=? WHERE id=1`
    ).run(newXP, newCoins, newTotalHabits);
  });

  doUncomplete();
  const updatedChar = db.prepare(`SELECT * FROM character WHERE id=1`).get();
  res.json({
    habit: db.prepare(`SELECT * FROM habits WHERE id=?`).get(id),
    character: { ...updatedChar, int: updatedChar.int_, xp_percent: Math.floor((updatedChar.xp / updatedChar.xp_to_next) * 100) },
  });
});

// GET /api/rpg/habits/:id/history
router.get('/:id/history', (req, res) => {
  const id = Number(req.params.id);
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const dates = db.prepare(`
    SELECT date FROM habit_completions
    WHERE habit_id=? AND date >= date('now', '-' || ? || ' days')
    ORDER BY date ASC
  `).all(id, days).map(r => r.date);
  const dateSet = new Set(dates);
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const s = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    result.push({ date: s, completed: dateSet.has(s) });
  }
  res.json(result);
});

module.exports = router;
