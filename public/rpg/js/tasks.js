/* ============================================================
   Life RPG — Tasks Tab
   ============================================================ */

let _taskEditing = null;
let _taskFilter  = 'active';
let _taskSort    = 'created_at';

function initTasksTab() {
  document.getElementById('btnAddTask').onclick = () => openTaskForm(null);
  document.getElementById('taskFormSave').onclick   = saveTask;
  document.getElementById('taskFormCancel').onclick = closeTaskForm;
  setupSegBtns('taskFilter');
  document.getElementById('taskSort').onchange = e => {
    _taskSort = e.target.value;
    renderTasks();
  };
  // filter seg buttons
  document.querySelectorAll('#taskFilter .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _taskFilter = btn.dataset.val;
      renderTasks();
    });
  });
  setupSegBtns('taskDifficulty');
}

async function renderTasks() {
  try {
    const params = { sort: _taskSort };
    if (_taskFilter === 'active')    params.completed = '0';
    if (_taskFilter === 'completed') params.completed = '1';
    const tasks = await apiGet('/tasks', params);
    renderTaskList(tasks);
  } catch (e) {
    console.error('Tasks error:', e);
  }
}

function renderTaskList(tasks) {
  const el = document.getElementById('taskList');
  if (!tasks.length) {
    el.innerHTML = '<p class="text-muted" style="padding:20px;text-align:center">No tasks here.</p>';
    return;
  }
  el.innerHTML = tasks.map(t => taskCard(t)).join('');
}

function taskCard(t) {
  const diff = t.difficulty.toLowerCase();
  const dueHtml = dueBadge(t.due_date, t.completed);
  return `
    <div class="card ${t.completed ? 'completed' : ''} prio-${t.priority}" id="task-card-${t.id}">
      <button class="complete-btn ${t.completed ? 'done' : ''}" onclick="completeTask(${t.id})" ${t.completed ? 'disabled' : ''}>✓</button>
      <div class="card-body">
        <div class="card-title">${escHtml(t.title)}</div>
        ${t.notes ? `<div class="card-notes">${escHtml(t.notes)}</div>` : ''}
        <div class="card-meta">
          <span class="badge badge-${diff}">${t.difficulty}</span>
          <span class="badge badge-prio-${t.priority}">${t.priority}</span>
          ${t.stat_target !== 'none' ? `<span class="badge badge-${t.stat_target}">${t.stat_target.toUpperCase()}</span>` : ''}
          ${dueHtml}
          ${t.completed ? `<span class="text-muted" style="font-size:.72rem">Done ${timeAgo(t.completed_at)}</span>` : ''}
        </div>
      </div>
      <div class="card-actions">
        ${!t.completed ? `<button class="btn-icon" onclick="openTaskForm(${t.id})" title="Edit">✏️</button>` : ''}
        <button class="btn-icon" onclick="deleteTask(${t.id})" title="Delete" style="color:var(--danger)">🗑️</button>
      </div>
    </div>
  `;
}

function dueBadge(dueDate, completed) {
  if (!dueDate || completed) return '';
  const today = new Date().toISOString().slice(0, 10);
  const type = dueDate < today ? 'overdue' : dueDate === today ? 'upcoming' : 'ok';
  return `<span class="due-badge ${type}">📅 ${dueDate}</span>`;
}

async function completeTask(id) {
  try {
    const data = await apiPost(`/tasks/${id}/complete`);
    handleCompletionRewards(data.rewards);
    updateHeader(data.character);
    await renderTasks();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function openTaskForm(id) {
  _taskEditing = id;
  const form = document.getElementById('taskForm');
  form.classList.remove('hidden');
  document.getElementById('taskFormTitle').textContent = id ? 'Edit Task' : 'New Task';
  document.getElementById('taskFormId').value = id || '';

  if (id) {
    apiGet('/tasks').then(tasks => {
      const t = tasks.find(x => x.id === id);
      if (!t) return;
      document.getElementById('taskTitle').value    = t.title;
      document.getElementById('taskNotes').value    = t.notes;
      document.getElementById('taskDueDate').value  = t.due_date || '';
      document.getElementById('taskPriority').value = t.priority;
      document.getElementById('taskStat').value     = t.stat_target;
      setSegValue('taskDifficulty', t.difficulty);
    });
  } else {
    document.getElementById('taskTitle').value    = '';
    document.getElementById('taskNotes').value    = '';
    document.getElementById('taskDueDate').value  = '';
    document.getElementById('taskPriority').value = 'normal';
    document.getElementById('taskStat').value     = 'none';
    setSegValue('taskDifficulty', 'Easy');
  }
  document.getElementById('taskTitle').focus();
}

function closeTaskForm() {
  document.getElementById('taskForm').classList.add('hidden');
  _taskEditing = null;
}

async function saveTask() {
  const title = document.getElementById('taskTitle').value.trim();
  if (!title) { showToast('Title is required', 'error'); return; }
  const body = {
    title,
    notes:       document.getElementById('taskNotes').value.trim(),
    difficulty:  getSegValue('taskDifficulty'),
    priority:    document.getElementById('taskPriority').value,
    due_date:    document.getElementById('taskDueDate').value || null,
    stat_target: document.getElementById('taskStat').value,
  };
  try {
    if (_taskEditing) {
      await apiPatch(`/tasks/${_taskEditing}`, body);
    } else {
      await apiPost('/tasks', body);
    }
    closeTaskForm();
    await renderTasks();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  try {
    await apiDelete(`/tasks/${id}`);
    await renderTasks();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
