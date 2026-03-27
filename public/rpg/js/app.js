/* ============================================================
   Life RPG — App Coordinator
   ============================================================ */

// Global state
const RPG = {
  character: null,
  currentTab: 'dashboard',
};

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initHabitsTab();
  initTasksTab();
  initRewardsTab();
  initCharacterTab();
  wireTabNav();

  try {
    // Daily reset (lazy, once per day)
    await apiPost('/maintenance/daily-reset');
    // Load character into header
    RPG.character = await apiGet('/character');
    updateHeader(RPG.character);
    // Render default tab
    await switchTab('dashboard');
  } catch (e) {
    console.error('Init error:', e);
    showToast('Failed to connect to server', 'error');
  }
});

// ── TAB ROUTING ───────────────────────────────────────────────
function wireTabNav() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

async function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
  RPG.currentTab = tab;
  switch (tab) {
    case 'dashboard': await renderDashboard(); break;
    case 'habits':    await renderHabits();    break;
    case 'tasks':     await renderTasks();     break;
    case 'rewards':   await renderRewards();   break;
    case 'character': await renderCharacter(); break;
  }
}

// ── HEADER UPDATE ─────────────────────────────────────────────
function updateHeader(char) {
  if (!char) return;
  RPG.character = char;
  document.getElementById('headerAvatar').textContent    = char.avatar || '🧙';
  document.getElementById('headerName').textContent      = char.name;
  document.getElementById('headerLevel').textContent     = `Lv.${char.level}`;
  document.getElementById('headerCoins').textContent     = char.coins;
  document.getElementById('headerXpFill').style.width    = `${char.xp_percent}%`;
  document.getElementById('headerXpText').textContent    = `${char.xp} / ${char.xp_to_next} XP`;
}

// ── COMPLETION REWARDS ────────────────────────────────────────
function handleCompletionRewards(rewards) {
  if (!rewards) return;
  const { xp_earned, coins_earned, streak_bonus, stat_boosted, leveled_up, new_levels, unlockables_earned } = rewards;
  // XP + coin toast
  let msg = `+${xp_earned} XP  +${coins_earned} 🪙`;
  if (streak_bonus) msg += ' 🔥 Streak bonus!';
  showToast(msg, 'xp');
  // Stat boost
  if (stat_boosted) showToast(`${stat_boosted.toUpperCase()} +1! 💪`, 'stat');
  // Level ups
  if (leveled_up && new_levels.length > 0) {
    const topLevel = new_levels[new_levels.length - 1];
    showLevelUpModal(topLevel);
  }
  // Unlocks
  if (unlockables_earned) {
    for (const u of unlockables_earned) {
      showToast(`${u.icon} Unlocked: ${u.title}`, 'unlock');
    }
  }
}

// ── LEVEL UP MODAL ────────────────────────────────────────────
function showLevelUpModal(level) {
  document.getElementById('modalLevelNum').textContent = level;
  document.getElementById('modalLevelMsg').textContent = `You reached level ${level}! Keep it up!`;
  document.getElementById('modalOverlay').classList.remove('hidden');
  document.getElementById('levelUpModal').classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modalLevelClose').onclick = () => {
    document.getElementById('modalOverlay').classList.add('hidden');
    document.getElementById('levelUpModal').classList.add('hidden');
  };
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) {
      document.getElementById('modalOverlay').classList.add('hidden');
      document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    }
  });
});

// ── TOAST SYSTEM ─────────────────────────────────────────────
function showToast(msg, type = 'xp') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  const typeMap = { xp: 'toast-xp', stat: 'toast-stat', unlock: 'toast-unlock', level: 'toast-level', error: 'toast-error' };
  toast.className = `toast ${typeMap[type] || ''}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// ── SHARED UTILITIES ──────────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = (Date.now() - new Date(isoStr + (isoStr.includes('T') ? '' : 'Z')).getTime()) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function setupSegBtns(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function getSegValue(groupId) {
  const active = document.querySelector(`#${groupId} .seg-btn.active`);
  return active ? active.dataset.val : null;
}

function setSegValue(groupId, value) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.seg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === value);
  });
}
