'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../rpg.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
-- ============================================================
-- CHARACTER (single row, id always 1)
-- ============================================================
CREATE TABLE IF NOT EXISTS character (
  id                INTEGER PRIMARY KEY DEFAULT 1,
  name              TEXT    NOT NULL DEFAULT 'Hero',
  class             TEXT    NOT NULL DEFAULT 'Adventurer',
  avatar            TEXT    NOT NULL DEFAULT '🧙',
  level             INTEGER NOT NULL DEFAULT 1,
  xp                INTEGER NOT NULL DEFAULT 0,
  xp_to_next        INTEGER NOT NULL DEFAULT 100,
  coins             INTEGER NOT NULL DEFAULT 0,
  str               INTEGER NOT NULL DEFAULT 5,
  int_              INTEGER NOT NULL DEFAULT 5,
  vit               INTEGER NOT NULL DEFAULT 5,
  dex               INTEGER NOT NULL DEFAULT 5,
  cha               INTEGER NOT NULL DEFAULT 5,
  total_xp_earned   INTEGER NOT NULL DEFAULT 0,
  total_tasks_done  INTEGER NOT NULL DEFAULT 0,
  total_habits_done INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO character (id) VALUES (1);

-- ============================================================
-- HABITS
-- ============================================================
CREATE TABLE IF NOT EXISTS habits (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  title                TEXT    NOT NULL,
  notes                TEXT    NOT NULL DEFAULT '',
  difficulty           TEXT    NOT NULL DEFAULT 'Easy'
                       CHECK (difficulty IN ('Easy','Medium','Hard','Epic')),
  stat_target          TEXT    NOT NULL DEFAULT 'none'
                       CHECK (stat_target IN ('none','str','int','vit','dex','cha')),
  frequency            TEXT    NOT NULL DEFAULT 'daily'
                       CHECK (frequency IN ('daily','weekly')),
  active               INTEGER NOT NULL DEFAULT 1,
  streak               INTEGER NOT NULL DEFAULT 0,
  best_streak          INTEGER NOT NULL DEFAULT 0,
  last_completed_date  TEXT,
  completed_today      INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- TASKS
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  notes         TEXT NOT NULL DEFAULT '',
  difficulty    TEXT NOT NULL DEFAULT 'Easy'
                CHECK (difficulty IN ('Easy','Medium','Hard','Epic')),
  stat_target   TEXT NOT NULL DEFAULT 'none'
                CHECK (stat_target IN ('none','str','int','vit','dex','cha')),
  due_date      TEXT,
  priority      TEXT NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('low','normal','high')),
  completed     INTEGER NOT NULL DEFAULT 0,
  completed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- REWARDS
-- ============================================================
CREATE TABLE IF NOT EXISTS rewards (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT    NOT NULL,
  notes            TEXT    NOT NULL DEFAULT '',
  cost             INTEGER NOT NULL DEFAULT 10,
  icon             TEXT    NOT NULL DEFAULT '🎁',
  times_purchased  INTEGER NOT NULL DEFAULT 0,
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- UNLOCKABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS unlockables (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT    NOT NULL,
  description   TEXT    NOT NULL DEFAULT '',
  category      TEXT    NOT NULL DEFAULT 'title'
                CHECK (category IN ('title','cosmetic','badge','ability')),
  unlock_type   TEXT    NOT NULL DEFAULT 'level'
                CHECK (unlock_type IN ('level','xp','tasks','habits','streak')),
  unlock_value  INTEGER NOT NULL DEFAULT 1,
  icon          TEXT    NOT NULL DEFAULT '🏆',
  unlocked      INTEGER NOT NULL DEFAULT 0,
  unlocked_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- ACTIVITY LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type  TEXT NOT NULL
              CHECK (event_type IN (
                'habit_complete','task_complete','level_up',
                'reward_purchased','streak_bonus','unlockable_earned',
                'streak_broken'
              )),
  description TEXT NOT NULL,
  xp_delta    INTEGER NOT NULL DEFAULT 0,
  coin_delta  INTEGER NOT NULL DEFAULT 0,
  meta        TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- HABIT COMPLETIONS (for streak math)
-- ============================================================
CREATE TABLE IF NOT EXISTS habit_completions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id  INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date      TEXT NOT NULL,
  UNIQUE(habit_id, date)
);

-- ============================================================
-- CONFIG
-- ============================================================
CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO config VALUES ('last_reset_date', '1970-01-01');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_completed   ON tasks(completed);
CREATE INDEX IF NOT EXISTS idx_tasks_due         ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_log_created       ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_completions_habit ON habit_completions(habit_id, date);
`);

// Seed unlockables
const seedUnlockables = db.prepare('SELECT COUNT(*) as c FROM unlockables').get();
if (seedUnlockables.c === 0) {
  const insertUnlock = db.prepare(`
    INSERT INTO unlockables (title, description, category, unlock_type, unlock_value, icon)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const unlockData = [
    ['Novice Adventurer', 'Start your journey', 'title',    'level',  1,   '🌱'],
    ['Journeyman',        'Reach level 5',       'title',    'level',  5,   '⚔️'],
    ['Veteran',           'Reach level 10',      'title',    'level',  10,  '🛡️'],
    ['Champion',          'Reach level 25',      'title',    'level',  25,  '👑'],
    ['Legend',            'Reach level 50',      'title',    'level',  50,  '🌟'],
    ['First Step',        'Complete your first task', 'badge', 'tasks', 1,  '👣'],
    ['Century',           'Complete 100 tasks',  'badge',    'tasks',  100, '💯'],
    ['Creature of Habit', 'Complete habits 50 times', 'badge','habits',50,  '🔄'],
    ['Week Warrior',      'Maintain a 7-day streak',  'badge','streak', 7,  '🔥'],
    ['Month Master',      'Maintain a 30-day streak', 'badge','streak', 30, '💎'],
    ['Thousandaire',      'Earn 1000 total XP',  'cosmetic', 'xp',    1000, '✨'],
  ];
  const seedAll = db.transaction(() => {
    for (const row of unlockData) insertUnlock.run(...row);
  });
  seedAll();
}

// Seed starter habits (only once)
const seedHabits = db.prepare('SELECT COUNT(*) as c FROM habits').get();
if (seedHabits.c === 0) {
  const insertHabit = db.prepare(`
    INSERT INTO habits (title, notes, difficulty, stat_target)
    VALUES (?, ?, ?, ?)
  `);
  const habitData = [
    ['Morning Exercise',   'Move your body for 15+ minutes', 'Medium', 'str'],
    ['Read for 30 min',    'Books, articles, anything educational', 'Easy', 'int'],
    ['Drink 8 cups water', 'Stay hydrated throughout the day', 'Easy', 'vit'],
    ['Meditate',           '10 minutes of mindfulness', 'Easy', 'cha'],
    ['Journal',            'Write down your thoughts and plans', 'Easy', 'int'],
  ];
  const seedH = db.transaction(() => {
    for (const row of habitData) insertHabit.run(...row);
  });
  seedH();
}

// Seed starter tasks (only once)
const seedTasks = db.prepare('SELECT COUNT(*) as c FROM tasks').get();
if (seedTasks.c === 0) {
  const insertTask = db.prepare(`
    INSERT INTO tasks (title, notes, difficulty, priority)
    VALUES (?, ?, ?, ?)
  `);
  const taskData = [
    ['Complete your first habit', 'Check off one of the starter habits to earn XP', 'Easy', 'high'],
    ['Define a reward',           'Add a real-life treat to the Rewards tab',        'Easy', 'normal'],
    ['Reach Level 2',             'Earn 100 XP to level up your character',          'Medium','normal'],
  ];
  const seedT = db.transaction(() => {
    for (const row of taskData) insertTask.run(...row);
  });
  seedT();
}

module.exports = db;
