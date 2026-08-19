import { createContext, type Context } from 'driftjs-shared';

export interface CounterStore {
  counter: number;
  historyLogs: string[];
  increment: () => void;
  decrement: () => void;
  reset: () => void;
}

export const CounterContext: Context<CounterStore> = createContext<CounterStore>(
  undefined,
  'CounterContext'
);
