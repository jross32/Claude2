/* ============================================================
   Life RPG — Habits Tab
   ============================================================ */

let _habitEditing = null;

function initHabitsTab() {
  document.getElementById('btnAddHabit').onclick = () => openHabitForm(null);
  document.getElementById('habitFormSave').onclick   = saveHabit;
  document.getElementById('habitFormCancel').onclick = closeHabitForm;
  setupSegBtns('habitDifficulty');
}

async function renderHabits() {
  try {
    const habits = await apiGet('/habits', { active: '1' });
    renderHabitList(habits);
  } catch (e) {
    console.error('Habits error:', e);
  }
}

function renderHabitList(habits) {
  const el = document.getElementById('habitList');
  if (!habits.length) {
    el.innerHTML = '<p class="text-muted" style="padding:20px;text-align:center">No habits yet. Add your first one!</p>';
    return;
  }
  el.innerHTML = habits.map(h => habitCard(h)).join('');
}

function habitCard(h) {
  const doneClass = h.completed_today ? 'done' : '';
  const diff = h.difficulty.toLowerCase();
  return `
    <div class="card ${h.completed_today ? 'completed' : ''}" id="habit-card-${h.id}">
      <button class="complete-btn ${doneClass}" onclick="toggleHabit(${h.id})" title="${h.completed_today ? 'Undo' : 'Complete'}">✓</button>
      <div class="card-body">
        <div class="card-title">${escHtml(h.title)}</div>
        ${h.notes ? `<div class="card-notes">${escHtml(h.notes)}</div>` : ''}
        <div class="card-meta">
          <span class="badge badge-${diff}">${h.difficulty}</span>
          ${h.stat_target !== 'none' ? `<span class="badge badge-${h.stat_target}">${h.stat_target.toUpperCase()}</span>` : ''}
          ${h.streak > 0 ? `<span class="streak"><span class="streak-icon">🔥</span>${h.streak}</span>` : ''}
          ${h.best_streak > 1 ? `<span class="text-muted" style="font-size:.72rem">Best: ${h.best_streak}</span>` : ''}
        </div>
      </div>
      <div class="card-actions">
        <button class="btn-icon" onclick="openHabitForm(${h.id})" title="Edit">✏️</button>
        <button class="btn-icon" onclick="archiveHabit(${h.id})" title="Archive">🗂️</button>
        <button class="btn-icon" onclick="deleteHabit(${h.id})" title="Delete" style="color:var(--danger)">🗑️</button>
      </div>
    </div>
  `;
}

async function toggleHabit(id) {
  const card = document.getElementById(`habit-card-${id}`);
  const btn  = card.querySelector('.complete-btn');
  const isDone = btn.classList.contains('done');
  try {
    if (isDone) {
      const data = await apiPost(`/habits/${id}/uncomplete`);
      updateHeader(data.character);
    } else {
      const data = await apiPost(`/habits/${id}/complete`);
      handleCompletionRewards(data.rewards);
      updateHeader(data.character);
    }
    await renderHabits();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function openHabitForm(id) {
  _habitEditing = id;
  const form = document.getElementById('habitForm');
  form.classList.remove('hidden');
  document.getElementById('habitFormTitle').textContent = id ? 'Edit Habit' : 'New Habit';
  document.getElementById('habitFormId').value = id || '';

  if (id) {
    apiGet(`/habits`).then(habits => {
      const h = habits.find(x => x.id === id);
      if (!h) return;
      document.getElementById('habitTitle').value = h.title;
      document.getElementById('habitNotes').value = h.notes;
      document.getElementById('habitStat').value  = h.stat_target;
      setSegValue('habitDifficulty', h.difficulty);
    });
  } else {
    document.getElementById('habitTitle').value = '';
    document.getElementById('habitNotes').value = '';
    document.getElementById('habitStat').value  = 'none';
    setSegValue('habitDifficulty', 'Easy');
  }
  document.getElementById('habitTitle').focus();
}

function closeHabitForm() {
  document.getElementById('habitForm').classList.add('hidden');
  _habitEditing = null;
}

async function saveHabit() {
  const title = document.getElementById('habitTitle').value.trim();
  if (!title) { showToast('Title is required', 'error'); return; }
  const body = {
    title,
    notes:       document.getElementById('habitNotes').value.trim(),
    difficulty:  getSegValue('habitDifficulty'),
    stat_target: document.getElementById('habitStat').value,
  };
  try {
    if (_habitEditing) {
      await apiPatch(`/habits/${_habitEditing}`, body);
    } else {
      await apiPost('/habits', body);
    }
    closeHabitForm();
    await renderHabits();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function archiveHabit(id) {
  try {
    await apiPatch(`/habits/${id}`, { active: false });
    await renderHabits();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteHabit(id) {
  if (!confirm('Delete this habit?')) return;
  try {
    await apiDelete(`/habits/${id}`);
    await renderHabits();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
