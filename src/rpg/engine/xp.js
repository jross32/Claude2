'use strict';

const XP_TABLE   = { Easy: 10, Medium: 25, Hard: 50, Epic: 100 };
const COIN_TABLE = { Easy: 5,  Medium: 12, Hard: 25, Epic: 50  };

function xpToNext(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

/**
 * Apply earned XP to a character snapshot.
 * Returns { level, xp, xp_to_next, levelsGained[] }.
 */
function applyXP(character, xpGained) {
  let { level, xp, xp_to_next } = character;
  let newXp = xp + xpGained;
  const levelsGained = [];
  while (newXp >= xp_to_next) {
    newXp -= xp_to_next;
    level++;
    xp_to_next = xpToNext(level);
    levelsGained.push(level);
  }
  return { level, xp: newXp, xp_to_next, levelsGained };
}

function baseRewards(difficulty) {
  return {
    xp:    XP_TABLE[difficulty]   || 10,
    coins: COIN_TABLE[difficulty] || 5,
  };
}

module.exports = { xpToNext, applyXP, baseRewards, XP_TABLE, COIN_TABLE };
