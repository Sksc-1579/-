(() => {
  'use strict';

  const STORAGE_KEY = 'soloptilink.tasks.v1';
  const FILTER_KEY = 'soloptilink.filter.v1';

  /** @type {{id:string, text:string, done:boolean, priority:'low'|'medium'|'high', due:string|null, createdAt:number}[]} */
  let tasks = [];
  let currentFilter = 'all';
  let draggedId = null;

  // --- Storage ---
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          tasks = parsed.filter(t => t && typeof t.id === 'string' && typeof t.text === 'string');
        }
      }
      const f = localStorage.getItem(FILTER_KEY);
      if (f === 'all' || f === 'active' || f === 'completed') currentFilter = f;
    } catch (err) {
      console.warn('Load failed, starting fresh:', err);
      tasks = [];
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      localStorage.setItem(FILTER_KEY, currentFilter);
    } catch (err) {
      console.warn('Save failed:', err);
      alert('保存に失敗しました。ブラウザのストレージ容量を確認してください。');
    }
  }

  // --- Utils ---
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function isOverdue(due, done) {
    if (!due || done) return false;
    return due < todayISO();
  }

  function formatDue(due) {
    if (!due) return '';
    const today = todayISO();
    if (due === today) return '今日まで';
    if (due < today) return `期限超過 (${due})`;
    return `〆 ${due}`;
  }

  // --- Actions ---
  function addTask(text, priority, due) {
    const trimmed = text.trim();
    if (!trimmed) return false;
    tasks.unshift({
      id: uid(),
      text: trimmed,
      done: false,
      priority: priority || 'medium',
      due: due || null,
      createdAt: Date.now(),
    });
    saveState();
    render();
    return true;
  }

  function toggleTask(id) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    t.done = !t.done;
    saveState();
    render();
  }

  function deleteTask(id) {
    tasks = tasks.filter(x => x.id !== id);
    saveState();
    render();
  }

  function updateText(id, newText) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const trimmed = newText.trim();
    if (!trimmed) {
      deleteTask(id);
      return;
    }
    t.text = trimmed;
    saveState();
    render();
  }

  function clearCompleted() {
    const had = tasks.some(t => t.done);
    if (!had) return;
    tasks = tasks.filter(t => !t.done);
    saveState();
    render();
  }

  function setFilter(f) {
    if (f !== 'all' && f !== 'active' && f !== 'completed') return;
    currentFilter = f;
    saveState();
    render();
  }

  function reorder(srcId, targetId) {
    if (srcId === targetId) return;
    const srcIdx = tasks.findIndex(t => t.id === srcId);
    const tgtIdx = tasks.findIndex(t => t.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    const [moved] = tasks.splice(srcIdx, 1);
    tasks.splice(tgtIdx, 0, moved);
    saveState();
    render();
  }

  // --- Render ---
  const $list = document.getElementById('task-list');
  const $empty = document.getElementById('empty-state');
  const $stats = document.getElementById('stats');
  const $filters = document.querySelectorAll('.filter-btn');

  function filtered() {
    if (currentFilter === 'active') return tasks.filter(t => !t.done);
    if (currentFilter === 'completed') return tasks.filter(t => t.done);
    return tasks;
  }

  function updateStats() {
    const total = tasks.length;
    const active = tasks.filter(t => !t.done).length;
    if (total === 0) {
      $stats.textContent = 'タスクはありません';
    } else {
      $stats.textContent = `未完了 ${active} / 全 ${total} 件`;
    }
  }

  function updateFilterButtons() {
    $filters.forEach(btn => {
      const on = btn.dataset.filter === currentFilter;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function createTaskElement(task) {
    const li = document.createElement('li');
    li.className = 'task-item' + (task.done ? ' completed' : '');
    li.dataset.id = task.id;
    li.draggable = true;

    // priority bar
    const pri = document.createElement('div');
    pri.className = `task-priority ${task.priority}`;
    pri.setAttribute('aria-label', `優先度: ${task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '低'}`);
    li.appendChild(pri);

    // checkbox
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'task-checkbox';
    cb.checked = task.done;
    cb.setAttribute('aria-label', `${task.text} を完了にする`);
    cb.addEventListener('change', () => toggleTask(task.id));
    li.appendChild(cb);

    // body
    const body = document.createElement('div');
    body.className = 'task-body';

    const text = document.createElement('span');
    text.className = 'task-text';
    text.textContent = task.text;
    text.tabIndex = 0;
    text.setAttribute('role', 'button');
    text.setAttribute('aria-label', 'ダブルクリックで編集');
    text.addEventListener('dblclick', () => startEdit(li, task));
    text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        startEdit(li, task);
      }
    });
    body.appendChild(text);

    if (task.due) {
      const meta = document.createElement('div');
      meta.className = 'task-meta';
      const due = document.createElement('span');
      due.className = 'task-due' + (isOverdue(task.due, task.done) ? ' overdue' : '');
      due.textContent = formatDue(task.due);
      meta.appendChild(due);
      body.appendChild(meta);
    }

    li.appendChild(body);

    // actions
    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'icon-btn';
    editBtn.textContent = '✏';
    editBtn.setAttribute('aria-label', 'タスクを編集');
    editBtn.addEventListener('click', () => startEdit(li, task));
    actions.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'icon-btn delete';
    delBtn.textContent = '✕';
    delBtn.setAttribute('aria-label', 'タスクを削除');
    delBtn.addEventListener('click', () => {
      if (confirm(`「${task.text}」を削除しますか？`)) deleteTask(task.id);
    });
    actions.appendChild(delBtn);

    li.appendChild(actions);

    // DnD
    li.addEventListener('dragstart', (e) => {
      draggedId = task.id;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      draggedId = null;
      li.classList.remove('dragging');
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      li.classList.add('drag-over');
    });
    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('drag-over');
      if (draggedId && draggedId !== task.id) reorder(draggedId, task.id);
    });

    return li;
  }

  function startEdit(li, task) {
    const body = li.querySelector('.task-body');
    const oldText = li.querySelector('.task-text');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'task-edit-input';
    input.value = task.text;
    input.maxLength = 200;
    input.setAttribute('aria-label', 'タスク名を編集');
    body.replaceChild(input, oldText);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    const finish = (commit) => {
      if (commit) {
        updateText(task.id, input.value);
      } else {
        render();
      }
    };

    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
  }

  function render() {
    updateStats();
    updateFilterButtons();

    const list = filtered();
    $list.textContent = ''; // safer than innerHTML=''
    if (list.length === 0) {
      $empty.hidden = false;
      if (tasks.length === 0) {
        $empty.textContent = 'タスクがありません。上のフォームから追加してください。';
      } else if (currentFilter === 'active') {
        $empty.textContent = '未完了タスクはありません 🎉';
      } else {
        $empty.textContent = '完了済みタスクはまだありません。';
      }
    } else {
      $empty.hidden = true;
      const frag = document.createDocumentFragment();
      list.forEach(t => frag.appendChild(createTaskElement(t)));
      $list.appendChild(frag);
    }
  }

  // --- Wiring ---
  function init() {
    loadState();

    const form = document.getElementById('task-form');
    const input = document.getElementById('task-input');
    const prio = document.getElementById('priority-input');
    const due = document.getElementById('due-input');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (addTask(input.value, prio.value, due.value || null)) {
        input.value = '';
        due.value = '';
        prio.value = 'medium';
        input.focus();
      }
    });

    $filters.forEach(btn => {
      btn.addEventListener('click', () => setFilter(btn.dataset.filter));
    });

    document.getElementById('clear-completed').addEventListener('click', () => {
      const count = tasks.filter(t => t.done).length;
      if (count === 0) return;
      if (confirm(`完了済み ${count} 件を削除しますか？`)) clearCompleted();
    });

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
