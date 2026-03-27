'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/rpg/activity
router.get('/', (req, res) => {
  const limit  = Math.min(100, Math.max(1, Number(req.query.limit)  || 20));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const total  = db.prepare(`SELECT COUNT(*) as c FROM activity_log`).get().c;
  const items  = db.prepare(`SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(limit, offset);
  const parsed = items.map(item => ({ ...item, meta: JSON.parse(item.meta || '{}') }));
  res.json({ total, items: parsed });
});

// DELETE /api/rpg/activity
router.delete('/', (req, res) => {
  const info = db.prepare(`DELETE FROM activity_log`).run();
  res.json({ deleted: info.changes });
});

module.exports = router;
