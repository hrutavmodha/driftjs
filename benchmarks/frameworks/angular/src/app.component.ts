import { Component, signal, ChangeDetectionStrategy } from '@angular/core';

interface RowItem {
  id: number;
  label: string;
}

const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"];
const colours = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"];
const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cup", "fish", "elephant", "aquarium", "guitar", "boat", "plane"];

function _random(max: number) {
  return Math.round(Math.random() * 1000) % max;
}

let nextId = 1;
function buildData(count: number): RowItem[] {
  const data = new Array<RowItem>(count);
  for (let i = 0; i < count; i++) {
    data[i] = {
      id: nextId++,
      label: adjectives[_random(adjectives.length)] + " " + colours[_random(colours.length)] + " " + nouns[_random(nouns.length)]
    };
  }
  return data;
}

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
})
export class AppComponent {
  data = signal<RowItem[]>([]);
  selected = signal<number>(0);

  run() {
    this.data.set(buildData(1000));
    this.selected.set(0);
  }

  runLots() {
    this.data.set(buildData(10000));
    this.selected.set(0);
  }

  add() {
    this.data.update(prev => prev.concat(buildData(1000)));
  }

  update() {
    this.data.update(prev => {
      const d = prev.slice();
      for (let i = 0; i < d.length; i += 10) {
        const item = d[i]!;
        d[i] = { id: item.id, label: item.label + ' !!!' };
      }
      return d;
    });
  }

  clear() {
    this.data.set([]);
    this.selected.set(0);
  }

  swapRows() {
    this.data.update(prev => {
      if (prev.length > 998) {
        const d = prev.slice();
        const temp = d[1]!;
        d[1] = d[998]!;
        d[998] = temp;
        return d;
      }
      return prev;
    });
  }

  select(id: number) {
    this.selected.set(id);
  }

  remove(id: number) {
    this.data.update(prev => {
      const idx = prev.findIndex(d => d.id === id);
      if (idx !== -1) {
        const d = prev.slice();
        d.splice(idx, 1);
        return d;
      }
      return prev;
    });
  }
}
