/* ============================================================
   Life RPG — Rewards Tab
   ============================================================ */

let _rewardEditing = null;
let _pendingPurchaseId = null;

function initRewardsTab() {
  document.getElementById('btnAddReward').onclick = () => openRewardForm(null);
  document.getElementById('rewardFormSave').onclick   = saveReward;
  document.getElementById('rewardFormCancel').onclick = closeRewardForm;
  document.getElementById('purchaseConfirm').onclick  = confirmPurchase;
  document.getElementById('purchaseCancel').onclick   = closePurchaseModal;
}

async function renderRewards() {
  try {
    const [char, rewards] = await Promise.all([
      apiGet('/character'),
      apiGet('/rewards'),
    ]);
    document.getElementById('rewardCoins').textContent = char.coins;
    renderRewardGrid(rewards, char.coins);
  } catch (e) {
    console.error('Rewards error:', e);
  }
}

function renderRewardGrid(rewards, coins) {
  const el = document.getElementById('rewardGrid');
  if (!rewards.length) {
    el.innerHTML = '<p class="text-muted" style="padding:30px;text-align:center;grid-column:1/-1">No rewards yet. Add something you\'d love to earn!</p>';
    return;
  }
  el.innerHTML = rewards.map(r => `
    <div class="reward-card" id="reward-card-${r.id}">
      <div class="reward-card-icon">${escHtml(r.icon || '🎁')}</div>
      <div class="reward-card-title">${escHtml(r.title)}</div>
      ${r.notes ? `<div class="text-muted" style="font-size:.78rem">${escHtml(r.notes)}</div>` : ''}
      <div class="reward-card-cost">🪙 ${r.cost}</div>
      ${r.times_purchased > 0 ? `<div class="reward-card-times">Purchased ${r.times_purchased}×</div>` : ''}
      <div class="reward-card-actions">
        <button class="btn btn-sm btn-buy ${coins < r.cost ? '' : ''}"
          ${coins < r.cost ? 'disabled' : ''}
          onclick="openPurchaseModal(${r.id})">
          ${coins < r.cost ? `Need ${r.cost - coins} more 🪙` : 'Buy'}
        </button>
        <button class="btn btn-sm btn-ghost" onclick="openRewardForm(${r.id})">✏️</button>
        <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="deleteReward(${r.id})">🗑️</button>
      </div>
    </div>
  `).join('');
}

function openPurchaseModal(id) {
  apiGet('/rewards').then(rewards => {
    const r = rewards.find(x => x.id === id);
    if (!r) return;
    _pendingPurchaseId = id;
    apiGet('/character').then(char => {
      document.getElementById('purchaseIcon').textContent  = r.icon || '🎁';
      document.getElementById('purchaseTitle').textContent = `Buy "${r.title}"?`;
      document.getElementById('purchaseMsg').textContent   =
        `Spend ${r.cost} coins? You'll have ${char.coins - r.cost} coins left.`;
      document.getElementById('modalOverlay').classList.remove('hidden');
      document.getElementById('purchaseModal').classList.remove('hidden');
    });
  });
}

async function confirmPurchase() {
  if (!_pendingPurchaseId) return;
  closePurchaseModal();
  try {
    const data = await apiPost(`/rewards/${_pendingPurchaseId}/purchase`);
    updateHeader(data.character);
    document.getElementById('rewardCoins').textContent = data.character.coins;
    showToast(`Enjoy your reward! -${data.coins_spent} 🪙`, 'xp');
    await renderRewards();
  } catch (e) {
    if (e.coins_needed) {
      showToast(`Need ${e.coins_needed - e.coins_have} more coins`, 'error');
    } else {
      showToast(e.message, 'error');
    }
  }
  _pendingPurchaseId = null;
}

function closePurchaseModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  document.getElementById('purchaseModal').classList.add('hidden');
  _pendingPurchaseId = null;
}

function openRewardForm(id) {
  _rewardEditing = id;
  const form = document.getElementById('rewardForm');
  form.classList.remove('hidden');
  document.getElementById('rewardFormTitle').textContent = id ? 'Edit Reward' : 'New Reward';
  if (id) {
    apiGet('/rewards').then(rewards => {
      const r = rewards.find(x => x.id === id);
      if (!r) return;
      document.getElementById('rewardIcon').value  = r.icon || '🎁';
      document.getElementById('rewardTitle').value = r.title;
      document.getElementById('rewardCost').value  = r.cost;
      document.getElementById('rewardNotes').value = r.notes;
    });
  } else {
    document.getElementById('rewardIcon').value  = '🎁';
    document.getElementById('rewardTitle').value = '';
    document.getElementById('rewardCost').value  = 10;
    document.getElementById('rewardNotes').value = '';
  }
}

function closeRewardForm() {
  document.getElementById('rewardForm').classList.add('hidden');
  _rewardEditing = null;
}

async function saveReward() {
  const title = document.getElementById('rewardTitle').value.trim();
  if (!title) { showToast('Title is required', 'error'); return; }
  const body = {
    title,
    icon:  document.getElementById('rewardIcon').value.trim()  || '🎁',
    cost:  Number(document.getElementById('rewardCost').value) || 10,
    notes: document.getElementById('rewardNotes').value.trim(),
  };
  try {
    if (_rewardEditing) {
      await apiPatch(`/rewards/${_rewardEditing}`, body);
    } else {
      await apiPost('/rewards', body);
    }
    closeRewardForm();
    await renderRewards();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteReward(id) {
  if (!confirm('Archive this reward?')) return;
  try {
    await apiDelete(`/rewards/${id}`);
    await renderRewards();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
