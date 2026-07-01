import { state, loadAll } from '../state.js';
import { put, del, uid } from '../db.js';
import { esc } from '../format.js';

// カレンダー下の空きスペースに置く「やることリスト」。
// 日付に紐づかない汎用チェックリスト（買い出し・連絡・目標など）。
export function renderTodos(el) {
  const draw = () => {
    const todos = state.todos;
    const remaining = todos.filter((t) => !t.done).length;
    const listHtml = todos.length === 0
      ? '<p class="muted todo-empty">やることを追加すると、ここに表示されます。</p>'
      : todos.map((t) => `
        <li class="todo-item ${t.done ? 'done' : ''}" data-id="${esc(t.id)}">
          <button class="todo-check" type="button" aria-label="${t.done ? '未完了に戻す' : '完了にする'}">${t.done ? '✓' : ''}</button>
          <span class="todo-text">${esc(t.text)}</span>
          <button class="todo-del" type="button" aria-label="削除">✕</button>
        </li>`).join('');

    el.innerHTML = `
      <section class="card todo-card">
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
          <h3 style="margin:0">やることリスト</h3>
          <span class="muted">${remaining > 0 ? `残り ${remaining} 件` : todos.length ? 'すべて完了 🎉' : ''}</span>
        </div>
        <form class="todo-add row" id="todoAdd">
          <input id="todoInput" class="inline-input" type="text" placeholder="やることを入力…"
            maxlength="120" autocomplete="off" style="flex:1;width:auto">
          <button class="btn" type="submit" style="width:auto;padding:10px 16px">追加</button>
        </form>
        <ul class="todo-list">${listHtml}</ul>
        ${todos.some((t) => t.done) ? '<button class="btn btn-ghost todo-clear" id="todoClear" type="button">完了済みを消す</button>' : ''}
      </section>`;

    el.querySelector('#todoAdd').onsubmit = async (e) => {
      e.preventDefault();
      const input = el.querySelector('#todoInput');
      const text = input.value.trim();
      if (!text) return;
      const order = state.todos.reduce((max, t) => Math.max(max, t.order || 0), 0) + 1;
      await put('todos', { id: uid(), text, done: false, order, createdAt: Date.now() });
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
