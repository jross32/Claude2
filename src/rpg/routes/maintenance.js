'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { todayString, yesterdayString } = require('../engine/streaks');

// POST /api/rpg/maintenance/daily-reset
router.post('/daily-reset', (req, res) => {
  const today     = todayString();
  const yesterday = yesterdayString();
  const lastReset = db.prepare(`SELECT value FROM config WHERE key='last_reset_date'`).get();

  if (lastReset && lastReset.value === today) {
    return res.json({ skipped: true, date: today });
  }

  const doReset = db.transaction(() => {
    // Find habits that missed yesterday (streak broken)
    const broken = db.prepare(`
      SELECT * FROM habits
      WHERE active=1
        AND completed_today=0
        AND last_completed_date IS NOT NULL
        AND last_completed_date < ?
    `).all(yesterday);

    for (const h of broken) {
      db.prepare(`UPDATE habits SET streak=0 WHERE id=?`).run(h.id);
      db.prepare(`INSERT INTO activity_log (event_type,description,xp_delta,coin_delta,meta) VALUES (?,?,0,0,?)`
      ).run('streak_broken', `Streak broken for "${h.title}" (was ${h.streak} days)`, JSON.stringify({ habit_id: h.id, streak_was: h.streak }));
    }

    // Reset completed_today for all habits
    db.prepare(`UPDATE habits SET completed_today=0 WHERE active=1`).run();
    // Update last reset date
    db.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES ('last_reset_date', ?)`).run(today);

    return broken;
  });

  const broken = doReset();
  res.json({
    date: today,
    habits_reset: db.prepare(`SELECT COUNT(*) as c FROM habits WHERE active=1`).get().c,
    streaks_broken: broken.map(h => ({ id: h.id, title: h.title, streak_was: h.streak })),
  });
});

module.exports = router;
