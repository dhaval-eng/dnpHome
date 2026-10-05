/* Shared inline password gate for actions that require auth (publishing,
   editing) on otherwise-public pages. Usage:

     const attempt = initAuthGate(document.getElementById('some-container'));
     const res = await attempt(() => fetch('/api/blog-posts', { method: 'POST', ... }));

   If the wrapped request comes back 401, a small password field is revealed
   inline inside `container`; once the correct password is submitted to
   /api/login (which sets the session cookie), the original request is
   retried automatically. */
function initAuthGate(container) {
  container.innerHTML = `
    <div class="auth-gate" hidden>
      <input type="password" class="auth-gate-password" placeholder="Password required">
      <button type="button" class="btn btn-primary auth-gate-unlock">Unlock</button>
      <p class="auth-gate-error"></p>
    </div>
  `;

  const gate = container.querySelector('.auth-gate');
  const input = container.querySelector('.auth-gate-password');
  const unlockBtn = container.querySelector('.auth-gate-unlock');
  const errorEl = container.querySelector('.auth-gate-error');

  let resolveWaiting = null;

  async function unlock() {
    errorEl.textContent = '';
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: input.value }),
    });

    if (!res.ok) {
      errorEl.textContent = 'Incorrect password.';
      return;
    }

    gate.hidden = true;
    input.value = '';
    if (resolveWaiting) {
      const resolve = resolveWaiting;
      resolveWaiting = null;
      resolve();
    }
  }

  unlockBtn.addEventListener('click', unlock);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      unlock();
    }
  });

  return async function attempt(requestFn) {
    const res = await requestFn();
    if (res.status !== 401) return res;

    gate.hidden = false;
    input.focus();

    await new Promise((resolve) => {
      resolveWaiting = resolve;
    });

    return requestFn();
  };
}
