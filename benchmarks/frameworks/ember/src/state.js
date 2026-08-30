import { trackedArray } from '@ember/reactive/collections';
import { run, runLots, add, update, swapRows } from './utils.js';

export class State {
  data = trackedArray();
  id = 1;
  _selectedRow = null;

  create = () => {
    const result = run(this.id);
    this.id = result.id;
    this.data.length = 0;
    this.data.push(...result.data);
    this._selectedRow = null;
  };

  add = () => {
    const result = add(this.id);
    this.data.push(...result.data);
    this.id = result.id;
  };

  update = () => {
    update(this.data);
  };

  runLots = () => {
    const result = runLots(this.id);
    this.data.length = 0;
    this.data.push(...result.data);
    this.id = result.id;
    this._selectedRow = null;
  };

  clear = () => {
    this.data.length = 0;
    this._selectedRow = null;
  };

  swapRows = () => {
    swapRows(this.data);
  };

  remove = (id) => {
    const idx = this.data.findIndex((d) => d.id === id);
    if (idx !== -1) {
      this.data.splice(idx, 1);
    }
  };

  select = (id) => {
    if (this._selectedRow) {
      this._selectedRow.selected = false;
    }
    const row = this.data.find((d) => d.id === id);
    if (row) {
      row.selected = true;
      this._selectedRow = row;
    }
  };
}

export const state = new State();
