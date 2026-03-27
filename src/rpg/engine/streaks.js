'use strict';

/**
 * XP multiplier and coin bonus based on current streak length.
 */
function streakMultiplier(streak) {
  if (streak >= 30) return { xpMult: 3.0, coinBonus: 30 };
  if (streak >= 14) return { xpMult: 2.0, coinBonus: 15 };
  if (streak >= 7)  return { xpMult: 1.5, coinBonus: 7  };
  if (streak >= 3)  return { xpMult: 1.25, coinBonus: 3 };
  return { xpMult: 1.0, coinBonus: 0 };
}

/**
 * Compute the new streak value given the last completed date and today.
 * today and lastDate are both 'YYYY-MM-DD' strings.
 */
function computeNewStreak(currentStreak, lastCompletedDate, today) {
  if (!lastCompletedDate) return 1;
  if (lastCompletedDate === today) return currentStreak; // already done today

  const last = new Date(lastCompletedDate);
  const todayDate = new Date(today);
  const diffDays = Math.round((todayDate - last) / 86400000);

  if (diffDays === 1) return currentStreak + 1;  // consecutive day
  return 1;                                        // gap — reset
}

/**
 * Returns today's date as YYYY-MM-DD in local time.
 */
function todayString() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/**
 * Returns yesterday's date as YYYY-MM-DD in local time.
 */
function yesterdayString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

module.exports = { streakMultiplier, computeNewStreak, todayString, yesterdayString };
