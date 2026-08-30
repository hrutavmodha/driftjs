import { tracked } from '@glimmer/tracking';

export class TodoItem {
  id;
  @tracked label;
  @tracked selected = false;

  constructor(id, label) {
    this.id = id;
    this.label = label;
    this.selected = false;
  }
}

const _random = (max) => {
  return Math.round(Math.random() * 1000) % max;
};

const updateData = (data, mod = 10) => {
  for (let i = 0; i < data.length; i += mod) {
    data[i].label += ' !!!';
  }
  return data;
};

const adjectives = [
  'pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome',
  'plain', 'quaint', 'clean', 'elegant', 'easy', 'angry', 'crazy', 'helpful',
  'mushy', 'odd', 'unsightly', 'adorable', 'important', 'inexpensive',
  'cheap', 'expensive', 'fancy',
];

const colours = [
  'red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown',
  'white', 'black', 'orange',
];

const nouns = [
  'table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cup',
  'fish', 'elephant', 'aquarium', 'guitar', 'boat', 'plane',
];

export const buildData = (id, count = 1000) => {
  const data = [];
  for (let i = 0; i < count; i++) {
    data.push(
      new TodoItem(
        id++,
        adjectives[_random(adjectives.length)] +
          ' ' +
          colours[_random(colours.length)] +
          ' ' +
          nouns[_random(nouns.length)]
      )
    );
  }
  return { data, id };
};

export const add = (id) => buildData(id, 1000);
export const run = (id) => buildData(id, 1000);
export const runLots = (id) => buildData(id, 10000);
export const update = (data) => updateData(data);

export const swapRows = (data) => {
  if (data.length > 998) {
    const temp = data[1];
    data[1] = data[998];
    data[998] = temp;
  }
};
