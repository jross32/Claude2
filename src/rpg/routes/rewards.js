'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/rpg/rewards
router.get('/', (req, res) => {
  const showAll = req.query.active === 'false' || req.query.all === 'true';
  const rewards = showAll
    ? db.prepare(`SELECT * FROM rewards ORDER BY created_at DESC`).all()
    : db.prepare(`SELECT * FROM rewards WHERE active=1 ORDER BY created_at DESC`).all();
  res.json(rewards);
});

// POST /api/rpg/rewards
router.post('/', (req, res) => {
  const { title, notes, cost, icon } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const parsedCost = Math.max(1, Math.floor(Number(cost) || 10));
  const result = db.prepare(`
    INSERT INTO rewards (title, notes, cost, icon)
    VALUES (?, ?, ?, ?)
  `).run(title, notes || '', parsedCost, icon || '🎁');
  res.status(201).json(db.prepare(`SELECT * FROM rewards WHERE id=?`).get(result.lastInsertRowid));
});

// PATCH /api/rpg/rewards/:id
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare(`SELECT id FROM rewards WHERE id=?`).get(id)) {
    return res.status(404).json({ error: 'Reward not found' });
  }
  const { title, notes, cost, icon, active } = req.body;
  const updates = [], params = [];
  if (title  !== undefined) { updates.push('title=?');  params.push(String(title).slice(0,200)); }
  if (notes  !== undefined) { updates.push('notes=?');  params.push(String(notes)); }
  if (cost   !== undefined) { updates.push('cost=?');   params.push(Math.max(1, Math.floor(Number(cost)))); }
  if (icon   !== undefined) { updates.push('icon=?');   params.push(String(icon).slice(0,10)); }
  if (active !== undefined) { updates.push('active=?'); params.push(active ? 1 : 0); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(id);
  db.prepare(`UPDATE rewards SET ${updates.join(', ')} WHERE id=?`).run(...params);
  res.json(db.prepare(`SELECT * FROM rewards WHERE id=?`).get(id));
});

// DELETE /api/rpg/rewards/:id
router.delete('/:id', (req, res) => {
  db.prepare(`UPDATE rewards SET active=0 WHERE id=?`).run(Number(req.params.id));
  res.json({ deleted: true });
});

// POST /api/rpg/rewards/:id/purchase
router.post('/:id/purchase', (req, res) => {
  const id = Number(req.params.id);
  const reward = db.prepare(`SELECT * FROM rewards WHERE id=? AND active=1`).get(id);
  if (!reward) return res.status(404).json({ error: 'Reward not found' });
  const char = db.prepare(`SELECT * FROM character WHERE id=1`).get();
  if (char.coins < reward.cost) {
    return res.status(400).json({
      error: 'Insufficient coins',
      coins_needed: reward.cost,
      coins_have: char.coins,
    });
  }
  const doPurchase = db.transaction(() => {
    db.prepare(`UPDATE character SET coins=coins-? WHERE id=1`).run(reward.cost);
    db.prepare(`UPDATE rewards SET times_purchased=times_purchased+1 WHERE id=?`).run(id);
    db.prepare(`INSERT INTO activity_log (event_type,description,xp_delta,coin_delta,meta) VALUES (?,?,0,?,?)`
    ).run('reward_purchased', `Purchased reward "${reward.title}" for ${reward.cost} coins`, -reward.cost, JSON.stringify({ reward_id: id }));
  });
  doPurchase();
  const updatedChar = db.prepare(`SELECT * FROM character WHERE id=1`).get();
  res.json({
    reward: db.prepare(`SELECT * FROM rewards WHERE id=?`).get(id),
    character: { ...updatedChar, int: updatedChar.int_, xp_percent: Math.floor((updatedChar.xp / updatedChar.xp_to_next) * 100) },
    coins_spent: reward.cost,
  });
});

module.exports = router;
