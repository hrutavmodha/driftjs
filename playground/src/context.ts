import { createContext, type Context } from 'driftjs-shared';

export interface UserState {
  name: string;
  role: string;
  avatar: string;
}

export interface ThemeState {
  mode: 'light' | 'dark';
  accentColor: string;
  fontFamily: string;
}

export interface NotificationState {
  unreadCount: number;
  latestNotice: string;
}

export interface UserStore {
  user: UserState;
  setUser: (u: UserState) => void;
  subscribe: (fn: (u: UserState) => void) => () => void;
}

export interface ThemeStore {
  theme: ThemeState;
  setMode: (mode: 'light' | 'dark') => void;
  setAccentColor: (accentColor: string) => void;
  toggleMode: () => void;
  subscribe: (fn: (t: ThemeState) => void) => () => void;
}

export interface NotificationStore {
  notice: NotificationState;
  increment: () => void;
  clear: () => void;
  setNotice: (msg: string) => void;
  subscribe: (fn: (n: NotificationState) => void) => () => void;
}

export function createUserStore(initial: UserState): UserStore {
  let current = { ...initial };
  const listeners = new Set<(u: UserState) => void>();
  return {
    get user() {
      return current;
    },
    setUser(u: UserState) {
      current = { ...u };
      listeners.forEach((fn) => fn(current));
    },
    subscribe(fn: (u: UserState) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function createThemeStore(initial: ThemeState): ThemeStore {
  let current = { ...initial };
  const listeners = new Set<(t: ThemeState) => void>();
  return {
    get theme() {
      return current;
    },
    setMode(mode: 'light' | 'dark') {
      current = { ...current, mode };
      listeners.forEach((fn) => fn(current));
    },
    setAccentColor(accentColor: string) {
      current = { ...current, accentColor };
      listeners.forEach((fn) => fn(current));
    },
    toggleMode() {
      const mode = current.mode === 'light' ? 'dark' : 'light';
      current = { ...current, mode };
      listeners.forEach((fn) => fn(current));
    },
    subscribe(fn: (t: ThemeState) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function createNotificationStore(initial: NotificationState): NotificationStore {
  let current = { ...initial };
  const listeners = new Set<(n: NotificationState) => void>();
  return {
    get notice() {
      return current;
    },
    increment() {
      const nextCount = current.unreadCount + 1;
      current = {
        ...current,
        unreadCount: nextCount,
        latestNotice: `Live Alert #${nextCount} at ${new Date().toLocaleTimeString()}`,
      };
      listeners.forEach((fn) => fn(current));
    },
    clear() {
      current = {
        ...current,
        unreadCount: 0,
        latestNotice: 'All notifications cleared',
      };
      listeners.forEach((fn) => fn(current));
    },
    setNotice(msg: string) {
      current = {
        ...current,
        unreadCount: current.unreadCount + 1,
        latestNotice: msg,
      };
      listeners.forEach((fn) => fn(current));
    },
    subscribe(fn: (n: NotificationState) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// 1. User Context
export const UserContext: Context<UserStore> = createContext<UserStore>(
  createUserStore({
    name: 'Guest User',
    role: 'Visitor',
    avatar: '👤',
  }),
  'UserContext'
);

// 2. Theme Context
export const ThemeContext: Context<ThemeStore> = createContext<ThemeStore>(
  createThemeStore({
    mode: 'light',
    accentColor: '#3b82f6',
    fontFamily: 'system-ui, sans-serif',
  }),
  'ThemeContext'
);

// 3. Notification Context
export const NotificationContext: Context<NotificationStore> = createContext<NotificationStore>(
  createNotificationStore({
    unreadCount: 0,
    latestNotice: 'No notifications',
  }),
  'NotificationContext'
);

