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

// 1. User Context with default guest state
export const UserContext: Context<UserState> = createContext<UserState>({
  name: 'Guest User',
  role: 'Visitor',
  avatar: '👤',
}, 'UserContext');

// 2. Theme Context with default theme settings
export const ThemeContext: Context<ThemeState> = createContext<ThemeState>({
  mode: 'light',
  accentColor: '#2563eb',
  fontFamily: 'system-ui, sans-serif',
}, 'ThemeContext');

// 3. Notification Context
export const NotificationContext: Context<NotificationState> = createContext<NotificationState>({
  unreadCount: 0,
  latestNotice: 'No notifications',
}, 'NotificationContext');
