// Talks to the back-end. In Electron: window.bt (preload). In the dev/test harness: HTTP POST.
export class ApiError extends Error {
  constructor(e) { super(e?.message || 'Something went wrong.'); this.code = e?.code || 'ERROR'; this.fields = e?.fields || null; }
}
export const session = { token: null, user: null };
const listeners = new Set();
export const onAuthLost = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

const transport = window.bt
  ? (channel, payload, token) => window.bt.invoke(channel, payload, token)
  : (channel, payload, token) => fetch('/__invoke', { method: 'POST', body: JSON.stringify({ channel, payload, token }) }).then((r) => r.json());

export async function api(channel, payload) {
  let res;
  try { res = await transport(channel, payload || {}, session.token); }
  catch { throw new ApiError({ code: 'TRANSPORT', message: 'Could not reach the application back-end. Restart the program.' }); }
  if (res.ok) return res.data;
  const err = new ApiError(res.error);
  if (err.code === 'UNAUTHENTICATED' || err.code === 'SESSION_EXPIRED') {
    session.token = null; session.user = null;
    listeners.forEach((fn) => fn(err));
  }
  throw err;
}
