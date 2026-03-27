/* ============================================================
   Life RPG — Dashboard Tab
   ============================================================ */

const STAT_ICONS = { str: '💪', int: '🧠', vit: '❤️', dex: '⚡', cha: '✨' };
const STAT_COLORS = { str: 'str', int: 'int', vit: 'vit', dex: 'dex', cha: 'cha' };

const EVENT_ICONS = {
  habit_complete:    '✅',
  task_complete:     '☑️',
  level_up:          '⬆️',
  reward_purchased:  '🎁',
  streak_bonus:      '🔥',
  unlockable_earned: '🏆',
  streak_broken:     '💔',
};

async function renderDashboard() {
  try {
    const [char, habits, activity] = await Promise.all([
      apiGet('/character'),
      apiGet('/habits', { active: '1' }),
      apiGet('/activity', { limit: '10' }),
    ]);
    renderDashStatGrid(char);
    renderDashTodayHabits(habits);
    renderDashActivity(activity.items);
    renderDashSnapshot(char);
  } catch (e) {
    console.error('Dashboard error:', e);
  }
}

function renderDashStatGrid(char) {
  const el = document.getElementById('dashStatGrid');
  const stats = ['str', 'int', 'vit', 'dex', 'cha'];
  el.innerHTML = `
    <h3 class="section-title">Character Stats</h3>
    <div class="stat-grid">
      ${stats.map(s => `
        <div class="stat-card ${STAT_COLORS[s]}">
          <div class="stat-icon">${STAT_ICONS[s]}</div>
          <div class="stat-name">${s.toUpperCase()}</div>
          <div class="stat-val">${char[s] ?? char['int_'] ?? 0}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderDashTodayHabits(habits) {
  const el = document.getElementById('dashHabits');
  if (!habits.length) {
    el.innerHTML = '<p class="text-muted" style="font-size:.82rem">No habits yet. Add one in the Habits tab!</p>';
    return;
  }
  el.innerHTML = habits.slice(0, 6).map(h => `
    <div class="today-card ${h.completed_today ? 'tc-done' : ''}"
         data-id="${h.id}" onclick="dashCompleteHabit(${h.id}, this)">
      <div class="tc-check">✓</div>
      <span class="tc-title">${escHtml(h.title)}</span>
      ${h.streak > 0 ? `<span class="tc-streak">🔥${h.streak}</span>` : ''}
      <span class="badge badge-${h.difficulty.toLowerCase()}">${h.difficulty}</span>
    </div>
  `).join('');
}

async function dashCompleteHabit(id, el) {
  if (el.classList.contains('tc-done')) return;
  try {
    const data = await apiPost(`/habits/${id}/complete`);
    el.classList.add('tc-done');
    el.querySelector('.tc-streak').textContent = `🔥${data.habit.streak}`;
    handleCompletionRewards(data.rewards);
    updateHeader(data.character);
  } catch (e) {
    if (e.message !== 'Already completed today') showToast('Error: ' + e.message, 'error');
  }
}

function renderDashActivity(items) {
  const el = document.getElementById('dashActivity');
  if (!items.length) {
    el.innerHTML = '<p class="text-muted" style="font-size:.82rem">No activity yet. Complete a habit or task!</p>';
    return;
  }
  el.innerHTML = items.map(item => {
    const icon = EVENT_ICONS[item.event_type] || '📌';
    const xpStr   = item.xp_delta   > 0 ? `<span class="delta-xp">+${item.xp_delta} XP</span>` : '';
    const coinStr = item.coin_delta > 0 ? `<span class="delta-coin">+${item.coin_delta} 🪙</span>` :
                    item.coin_delta < 0 ? `<span class="delta-coin text-danger">${item.coin_delta} 🪙</span>` : '';
    return `
      <div class="activity-item">
        <span class="activity-icon">${icon}</span>
        <div class="activity-body">
          <div class="activity-desc">${escHtml(item.description)}</div>
          <div class="activity-deltas">${xpStr}${coinStr}</div>
          <div class="activity-time">${timeAgo(item.created_at)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderDashSnapshot(char) {
  const el = document.getElementById('dashSnapshot');
  el.innerHTML = `
    <h3 class="section-title">Lifetime Stats</h3>
    <div class="snapshot-grid">
      <div class="snap-card">
        <div class="snap-val">${char.total_xp_earned.toLocaleString()}</div>
        <div class="snap-lbl">Total XP</div>
      </div>
      <div class="snap-card">
        <div class="snap-val">${char.total_tasks_done}</div>
        <div class="snap-lbl">Tasks Done</div>
      </div>
      <div class="snap-card">
        <div class="snap-val">${char.total_habits_done}</div>
        <div class="snap-lbl">Habits Done</div>
      </div>
      <div class="snap-card">
        <div class="snap-val">${char.level}</div>
        <div class="snap-lbl">Level</div>
      </div>
    </div>
  `;
}
