/* ============================================================
   Life RPG — Character Tab
   ============================================================ */

const AVATARS = ['🧙', '⚔️', '🛡️', '🏹', '🧝', '🦸', '🧟', '🐉'];
const STAT_COLORS_CHAR = { str: 'var(--str-color)', int: 'var(--int-color)', vit: 'var(--vit-color)', dex: 'var(--dex-color)', cha: 'var(--cha-color)' };

function initCharacterTab() {
  renderAvatarPicker();
  document.getElementById('charSaveBtn').onclick = saveCharacter;
}

async function renderCharacter() {
  try {
    const [char, unlockables] = await Promise.all([
      apiGet('/character'),
      apiGet('/unlockables'),
    ]);
    renderCharDisplay(char);
    renderUnlockables(unlockables);
    renderLifetimeStats(char);
  } catch (e) {
    console.error('Character error:', e);
  }
}

function renderCharDisplay(char) {
  // Avatar picker selection
  document.querySelectorAll('.avatar-opt').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.avatar === char.avatar);
  });
  document.getElementById('charName').value  = char.name;
  document.getElementById('charClass').value = char.class;
  document.getElementById('charLevelOrb').textContent = char.level;
  document.getElementById('charXpFill').style.width   = `${char.xp_percent}%`;
  document.getElementById('charXpNumbers').textContent = `${char.xp.toLocaleString()} / ${char.xp_to_next.toLocaleString()} XP`;

  // Stat cards
  const stats = [
    { key: 'str', label: 'STR', icon: '💪', val: char.str },
    { key: 'int', label: 'INT', icon: '🧠', val: char.int },
    { key: 'vit', label: 'VIT', icon: '❤️', val: char.vit },
    { key: 'dex', label: 'DEX', icon: '⚡', val: char.dex },
    { key: 'cha', label: 'CHA', icon: '✨', val: char.cha },
  ];
  document.getElementById('charStatsPanel').innerHTML = stats.map(s => `
    <div class="cstat-card">
      <div class="cstat-name">${s.icon} ${s.label}</div>
      <div class="cstat-val" style="color:${STAT_COLORS_CHAR[s.key]}">${s.val}</div>
    </div>
  `).join('');
}

function renderAvatarPicker() {
  const picker = document.getElementById('avatarPicker');
  picker.innerHTML = AVATARS.map(a => `
    <div class="avatar-opt" data-avatar="${a}" onclick="selectAvatar('${a}')">${a}</div>
  `).join('');
}

function selectAvatar(avatar) {
  document.querySelectorAll('.avatar-opt').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.avatar === avatar);
  });
}

async function saveCharacter() {
  const selectedAvatar = document.querySelector('.avatar-opt.active')?.dataset.avatar || '🧙';
  const body = {
    name:   document.getElementById('charName').value.trim()  || 'Hero',
    class:  document.getElementById('charClass').value.trim() || 'Adventurer',
    avatar: selectedAvatar,
  };
  try {
    const char = await apiPatch('/character', body);
    updateHeader(char);
    showToast('Character saved!', 'xp');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function renderUnlockables(unlockables) {
  const earned = unlockables.filter(u => u.unlocked);
  const locked = unlockables.filter(u => !u.unlocked);
  const el = document.getElementById('unlockablesGallery');
  el.innerHTML = `
    <div class="unlock-group-title">Earned (${earned.length})</div>
    <div class="unlock-grid">
      ${earned.length ? earned.map(u => unlockCard(u, true)).join('') : '<p class="text-muted" style="font-size:.8rem">None yet — keep going!</p>'}
    </div>
    <div class="unlock-group-title" style="margin-top:14px">Locked (${locked.length})</div>
    <div class="unlock-grid">
      ${locked.map(u => unlockCard(u, false)).join('')}
    </div>
  `;
}

function unlockCard(u, earned) {
  const hint = !earned ? `<div class="unlock-desc">${unlockHint(u)}</div>` : `<div class="unlock-desc">${escHtml(u.description)}</div>`;
  return `
    <div class="unlock-card ${earned ? '' : 'locked'}">
      <div class="unlock-icon">${u.unlocked ? u.icon : '🔒'}</div>
      <div class="unlock-info">
        <div class="unlock-title">${escHtml(u.title)}</div>
        ${hint}
      </div>
    </div>
  `;
}

function unlockHint(u) {
  const typeMap = { level: `Reach level ${u.unlock_value}`, xp: `Earn ${u.unlock_value} total XP`, tasks: `Complete ${u.unlock_value} tasks`, habits: `Complete habits ${u.unlock_value} times`, streak: `${u.unlock_value}-day streak` };
  return typeMap[u.unlock_type] || escHtml(u.description);
}

function renderLifetimeStats(char) {
  document.getElementById('lifetimeStats').innerHTML = `
    <h3 class="section-title">Lifetime Stats</h3>
    <div class="ls-row"><span>Level</span><span class="ls-val">${char.level}</span></div>
    <div class="ls-row"><span>Total XP Earned</span><span class="ls-val">${char.total_xp_earned.toLocaleString()}</span></div>
    <div class="ls-row"><span>Tasks Completed</span><span class="ls-val">${char.total_tasks_done}</span></div>
    <div class="ls-row"><span>Habits Completed</span><span class="ls-val">${char.total_habits_done}</span></div>
    <div class="ls-row"><span>Coins</span><span class="ls-val" style="color:var(--coin-color)">${char.coins} 🪙</span></div>
  `;
}
