const TOKEN_KEY = 'ie-video-token';
const USERNAME_KEY = 'ie-video-username';
const CATEGORY_KEY = 'ie-video-category';

export type SessionUser = {
  username: string;
  category: string;
};

export function getStoredToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(TOKEN_KEY) || '';
}

export function getStoredSessionUser(): SessionUser {
  if (typeof window === 'undefined') {
    return { username: 'Administrator', category: 'FF28' };
  }

  return {
    username: window.localStorage.getItem(USERNAME_KEY) || 'Administrator',
    category: window.localStorage.getItem(CATEGORY_KEY) || 'FF28',
  };
}

export function persistSession(token: string, user: SessionUser) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USERNAME_KEY, user.username);
  window.localStorage.setItem(CATEGORY_KEY, user.category);
}

export function clearStoredSession() {
  if (typeof window === 'undefined') return;

  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USERNAME_KEY);
  window.localStorage.removeItem(CATEGORY_KEY);
}
