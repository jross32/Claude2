'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { applyXP, baseRewards } = require('../engine/xp');
const { rollStatGain, statColumn, checkUnlockables } = require('../engine/stats');
const { todayString } = require('../engine/streaks');

// GET /api/rpg/tasks
router.get('/', (req, res) => {
  const completed = req.query.completed;
  const priority  = req.query.priority;
  const sort = req.query.sort;

  let where = [];
  let params = [];
  if (completed !== undefined) { where.push('completed=?'); params.push(completed === '1' ? 1 : 0); }
  if (priority  !== undefined && ['low','normal','high'].includes(priority)) {
    where.push('priority=?'); params.push(priority);
  }

  const validSorts = { due_date: 'due_date ASC', created_at: 'created_at DESC', difficulty: 'difficulty DESC', priority: "CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END ASC" };
  const orderBy = validSorts[sort] || 'created_at DESC';
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const tasks = db.prepare(`SELECT * FROM tasks ${whereClause} ORDER BY ${orderBy}`).all(...params);
  res.json(tasks);
});

// POST /api/rpg/tasks
router.post('/', (req, res) => {
  const { title, notes, difficulty, stat_target, due_date, priority } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const diff = ['Easy','Medium','Hard','Epic'].includes(difficulty) ? difficulty : 'Easy';
  const stat = ['none','str','int','vit','dex','cha'].includes(stat_target) ? stat_target : 'none';
  const prio = ['low','normal','high'].includes(priority) ? priority : 'normal';
  const dueDate = due_date || null;
  const result = db.prepare(`
    INSERT INTO tasks (title, notes, difficulty, stat_target, due_date, priority)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, notes || '', diff, stat, dueDate, prio);
  res.status(201).json(db.prepare(`SELECT * FROM tasks WHERE id=?`).get(result.lastInsertRowid));
});

// PATCH /api/rpg/tasks/:id
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const task = db.prepare(`SELECT * FROM tasks WHERE id=?`).get(id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const { title, notes, difficulty, stat_target, due_date, priority } = req.body;
  const updates = [], params = [];
  if (title      !== undefined) { updates.push('title=?');      params.push(String(title).slice(0,200)); }
  if (notes      !== undefined) { updates.push('notes=?');      params.push(String(notes)); }
  if (difficulty !== undefined && ['Easy','Medium','Hard','Epic'].includes(difficulty)) {
    updates.push('difficulty=?'); params.push(difficulty);
  }
  if (stat_target !== undefined && ['none','str','int','vit','dex','cha'].includes(stat_target)) {
    updates.push('stat_target=?'); params.push(stat_target);
  }
  if (due_date !== undefined)  { updates.push('due_date=?');   params.push(due_date || null); }
  if (priority !== undefined && ['low','normal','high'].includes(priority)) {
    updates.push('priority=?'); params.push(priority);
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(id);
  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id=?`).run(...params);
  res.json(db.prepare(`SELECT * FROM tasks WHERE id=?`).get(id));
});

// DELETE /api/rpg/tasks/:id
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`DELETE FROM tasks WHERE id=?`).run(id);
  res.json({ deleted: true });
});

// POST /api/rpg/tasks/:id/complete
router.post('/:id/complete', (req, res) => {
  const id = Number(req.params.id);
  const task = db.prepare(`SELECT * FROM tasks WHERE id=?`).get(id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.completed) return res.status(409).json({ error: 'Task already completed' });

  const { xp: baseXP, coins: baseCoins } = baseRewards(task.difficulty);
  const boostedStat = rollStatGain(task.difficulty, task.stat_target);

  const doComplete = db.transaction(() => {
    db.prepare(`UPDATE tasks SET completed=1, completed_at=datetime('now') WHERE id=?`).run(id);
    const char = db.prepare(`SELECT * FROM character WHERE id=1`).get();
    const { level, xp, xp_to_next, levelsGained } = applyXP(char, baseXP);
    const statUpdate = boostedStat ? `, ${statColumn(boostedStat)}=${statColumn(boostedStat)}+1` : '';
    db.prepare(`
      UPDATE character
      SET xp=?, xp_to_next=?, level=?,
          coins=coins+?,
          total_xp_earned=total_xp_earned+?,
          total_tasks_done=total_tasks_done+1
          ${statUpdate}
      WHERE id=1
    `).run(xp, xp_to_next, level, baseCoins, baseXP);
    for (const lvl of levelsGained) {
      db.prepare(`INSERT INTO activity_log (event_type,description,xp_delta,coin_delta,meta) VALUES (?,?,0,0,?)`
      ).run('level_up', `Reached level ${lvl}!`, JSON.stringify({ level: lvl }));
    }
    db.prepare(`INSERT INTO activity_log (event_type,description,xp_delta,coin_delta,meta) VALUES (?,?,?,?,?)`
    ).run('task_complete', `Completed task "${task.title}" +${baseXP} XP +${baseCoins} coins`, baseXP, baseCoins, JSON.stringify({ task_id: id }));
    const updatedChar = db.prepare(`SELECT * FROM character WHERE id=1`).get();
    const newUnlocks = checkUnlockables(db, updatedChar);
    for (const u of newUnlocks) {
      db.prepare(`INSERT INTO activity_log (event_type,description,xp_delta,coin_delta,meta) VALUES (?,?,0,0,?)`
      ).run('unlockable_earned', `Unlocked: ${u.title} ${u.icon}`, JSON.stringify({ unlockable_id: u.id }));
    }
    return { levelsGained, newUnlocks, updatedChar };
  });

  const { levelsGained, newUnlocks, updatedChar } = doComplete();
  res.json({
    task: db.prepare(`SELECT * FROM tasks WHERE id=?`).get(id),
    character: { ...updatedChar, int: updatedChar.int_, xp_percent: Math.floor((updatedChar.xp / updatedChar.xp_to_next) * 100) },
    rewards: {
      xp_earned:          baseXP,
      coins_earned:       baseCoins,
      stat_boosted:       boostedStat,
      leveled_up:         levelsGained.length > 0,
      new_levels:         levelsGained,
      unlockables_earned: newUnlocks.map(u => ({ id: u.id, title: u.title, icon: u.icon, description: u.description })),
    },
  });
});

module.exports = router;
