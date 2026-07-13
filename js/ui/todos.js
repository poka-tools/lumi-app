import { state, loadAll } from '../state.js';
import { put, del, uid } from '../db.js';
import { esc, todayIso, shortDateJa } from '../format.js';

// 期限で並べ替え：期限ありを日付昇順で先に、期限なしは order 順で後ろに。
function sortByDue(todos) {
  return [...todos].sort((a, b) => {
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return (a.order || 0) - (b.order || 0);
  });
}

// 未完了Todoを「期限切れ／今日締切」に振り分け（リマインダー用）。
export function dueBuckets(today = todayIso()) {
  const pending = state.todos.filter((t) => !t.done && t.due);
  return {
    overdue: sortByDue(pending.filter((t) => t.due < today)),
    today: sortByDue(pending.filter((t) => t.due === today)),
  };
}

// カレンダー下の「やることリスト」。日付に紐づかない汎用チェックリスト＋任意の期限。
export function renderTodos(el) {
  const draw = () => {
    const today = todayIso();
    const todos = sortByDue(state.todos);
    const remaining = todos.filter((t) => !t.done).length;

    const dueChip = (t) => {
      if (!t.done && t.due && t.due < today) return `<span class="todo-due-chip overdue">期限切れ ${shortDateJa(t.due)}</span>`;
      if (!t.done && t.due === today) return '<span class="todo-due-chip today">今日まで</span>';
      if (t.due) return `<span class="todo-due-chip">${shortDateJa(t.due)}</span>`;
      return '';
    };

    const listHtml = todos.length === 0
      ? '<p class="muted todo-empty">やることを追加すると、ここに表示されます。</p>'
      : todos.map((t) => `
        <li class="todo-item ${t.done ? 'done' : ''}" data-id="${esc(t.id)}">
          <button class="todo-check" type="button" aria-label="${t.done ? '未完了に戻す' : '完了にする'}">${t.done ? '✓' : ''}</button>
          <div class="todo-main">
            <span class="todo-text">${esc(t.text)}</span>
            ${dueChip(t)}
          </div>
          <label class="todo-date-btn" aria-label="期限を設定">📅
            <input class="todo-due-input" type="date" value="${esc(t.due || '')}">
          </label>
          <button class="todo-del" type="button" aria-label="削除">✕</button>
        </li>`).join('');

    el.innerHTML = `
      <section class="card todo-card">
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
          <h3 style="margin:0">やることリスト</h3>
          <span class="muted">${remaining > 0 ? `残り ${remaining} 件` : todos.length ? 'すべて完了 🎉' : ''}</span>
        </div>
        <p class="muted" style="font-size:12px;margin:0 0 8px">終わったら左の□にチェックを入れましょう。</p>
        <form class="todo-add" id="todoAdd">
          <input id="todoInput" class="inline-input" type="text" placeholder="やることを入力…"
            maxlength="120" autocomplete="off" style="width:100%">
          <div class="row" style="margin-top:8px;align-items:center">
            <label class="muted" style="flex:0 0 auto">期限
              <input id="todoDue" type="date" style="margin-left:6px">
            </label>
            <button class="btn" type="submit" style="flex:1;padding:10px 16px">追加</button>
          </div>
        </form>
        <ul class="todo-list">${listHtml}</ul>
        ${todos.some((t) => t.done) ? '<button class="btn btn-ghost todo-clear" id="todoClear" type="button">完了済みを消す</button>' : ''}
      </section>`;

    el.querySelector('#todoAdd').onsubmit = async (e) => {
      e.preventDefault();
      const input = el.querySelector('#todoInput');
      const text = input.value.trim();
      if (!text) return;
      const due = el.querySelector('#todoDue').value || '';
      const order = state.todos.reduce((max, t) => Math.max(max, t.order || 0), 0) + 1;
      await put('todos', { id: uid(), text, due, done: false, order, createdAt: Date.now() });
      await loadAll();
      draw();
      el.querySelector('#todoInput').focus();
    };

    el.querySelectorAll('.todo-item').forEach((li) => {
      const id = li.dataset.id;
      const todo = state.todos.find((t) => t.id === id);
      const toggle = async () => {
        await put('todos', { ...todo, done: !todo.done });
        await loadAll();
        draw();
      };
      li.querySelector('.todo-check').onclick = toggle;
      li.querySelector('.todo-text').onclick = toggle;
      li.querySelector('.todo-due-input').onchange = async (e) => {
        await put('todos', { ...todo, due: e.target.value || '' });
        await loadAll();
        draw();
      };
      li.querySelector('.todo-del').onclick = async () => {
        await del('todos', id);
        await loadAll();
        draw();
      };
    });

    const clear = el.querySelector('#todoClear');
    if (clear) clear.onclick = async () => {
      const done = state.todos.filter((t) => t.done);
      await Promise.all(done.map((t) => del('todos', t.id)));
      await loadAll();
      draw();
    };
  };

  draw();
}

// アプリ内リマインダー：期限切れの未完了Todoを警告表示（今日締切は「本日の予定」で表示）。
export function renderReminder(el) {
  const draw = () => {
    const { overdue } = dueBuckets();
    if (overdue.length === 0) { el.innerHTML = ''; return; }

    const line = (t) => `
      <li class="remind-item" data-id="${esc(t.id)}">
        <button class="todo-check" type="button" aria-label="完了にする"></button>
        <span class="remind-text">${esc(t.text)}</span>
        <span class="remind-tag overdue">期限切れ ${shortDateJa(t.due)}</span>
      </li>`;

    el.innerHTML = `
      <div class="card remind-card">
        <div class="remind-head">🔔 期限切れのやること</div>
        <div class="muted" style="font-size:12px;margin:0 0 6px">終わったら左の□にチェックを入れましょう。</div>
        <ul class="remind-list">
          ${overdue.map((t) => line(t)).join('')}
        </ul>
      </div>`;

    el.querySelectorAll('.remind-item').forEach((li) => {
      const todo = state.todos.find((t) => t.id === li.dataset.id);
      li.querySelector('.todo-check').onclick = async () => {
        await put('todos', { ...todo, done: true });
        await loadAll();
        draw();
      };
    });
  };

  draw();
}
