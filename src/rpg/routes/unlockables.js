'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkUnlockables } = require('../engine/stats');

// GET /api/rpg/unlockables
router.get('/', (req, res) => {
  const filter = req.query.unlocked;
  let rows;
  if (filter === 'true') {
    rows = db.prepare(`SELECT * FROM unlockables WHERE unlocked=1 ORDER BY unlocked_at DESC`).all();
  } else if (filter === 'false') {
    rows = db.prepare(`SELECT * FROM unlockables WHERE unlocked=0 ORDER BY unlock_value ASC`).all();
  } else {
    rows = db.prepare(`SELECT * FROM unlockables ORDER BY unlocked DESC, unlock_value ASC`).all();
  }
  res.json(rows);
});

// POST /api/rpg/unlockables/check
router.post('/check', (req, res) => {
  const char = db.prepare(`SELECT * FROM character WHERE id=1`).get();
  const newlyUnlocked = checkUnlockables(db, char);
  for (const u of newlyUnlocked) {
    db.prepare(`INSERT INTO activity_log (event_type,description,xp_delta,coin_delta,meta) VALUES (?,?,0,0,?)`
    ).run('unlockable_earned', `Unlocked: ${u.title} ${u.icon}`, JSON.stringify({ unlockable_id: u.id }));
  }
  res.json({ newly_unlocked: newlyUnlocked.map(u => ({ id: u.id, title: u.title, icon: u.icon, description: u.description })) });
});

module.exports = router;
