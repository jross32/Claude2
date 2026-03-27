'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');

function getCharacter() {
  const c = db.prepare(`SELECT * FROM character WHERE id = 1`).get();
  return {
    ...c,
    int: c.int_,   // expose as 'int' to frontend
    xp_percent: Math.floor((c.xp / c.xp_to_next) * 100),
  };
}

// GET /api/rpg/character
router.get('/', (req, res) => {
  res.json(getCharacter());
});

// PATCH /api/rpg/character
router.patch('/', (req, res) => {
  const { name, class: cls, avatar } = req.body;
  const updates = [];
  const params = [];
  if (name  !== undefined) { updates.push('name=?');   params.push(String(name).slice(0, 60)); }
  if (cls   !== undefined) { updates.push('class=?');  params.push(String(cls).slice(0, 60));  }
  if (avatar !== undefined){ updates.push('avatar=?'); params.push(String(avatar).slice(0, 10)); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  db.prepare(`UPDATE character SET ${updates.join(', ')} WHERE id=1`).run(...params);
  res.json(getCharacter());
});

module.exports = router;
module.exports.getCharacter = getCharacter;
