import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';

const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"];
const colours = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"];
const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cup", "fish", "elephant", "aquarium", "guitar", "boat", "plane"];

function _random(max) {
  return Math.round(Math.random() * 1000) % max;
}

let nextId = 1;
function buildData(count) {
  const data = new Array(count);
  for (let i = 0; i < count; i++) {
    data[i] = {
      id: nextId++,
      label: adjectives[_random(adjectives.length)] + " " + colours[_random(colours.length)] + " " + nouns[_random(nouns.length)]
    };
  }
  return data;
}

const eq = (a, b) => a === b;

export class App extends Component {
  @tracked data = [];
  @tracked selected = 0;

  @action
  run() {
    this.data = buildData(1000);
    this.selected = 0;
  }

  @action
  runLots() {
    this.data = buildData(10000);
    this.selected = 0;
  }

  @action
  add() {
    this.data = this.data.concat(buildData(1000));
  }

  @action
  update() {
    const d = this.data.slice();
    for (let i = 0; i < d.length; i += 10) {
      const item = d[i];
      d[i] = { id: item.id, label: item.label + ' !!!' };
    }
    this.data = d;
  }

  @action
  clear() {
    this.data = [];
    this.selected = 0;
  }

  @action
  swapRows() {
    if (this.data.length > 998) {
      const d = this.data.slice();
      const temp = d[1];
      d[1] = d[998];
      d[998] = temp;
      this.data = d;
    }
  }

  @action
  select(id) {
    this.selected = id;
  }

  @action
  remove(id) {
    const idx = this.data.findIndex(d => d.id === id);
    if (idx !== -1) {
      const d = this.data.slice();
      d.splice(idx, 1);
      this.data = d;
    }
  }

  <template>
    <div class="container">
      <div class="jumbotron">
        <div class="row">
          <div class="col-md-6">
            <h1>Ember (keyed)</h1>
          </div>
          <div class="col-md-6">
            <div class="row">
              <div class="col-sm-6 smallpad">
                <button type="button" class="btn btn-primary btn-block" id="run" {{on "click" this.run}}>Create 1,000 rows</button>
              </div>
              <div class="col-sm-6 smallpad">
                <button type="button" class="btn btn-primary btn-block" id="runlots" {{on "click" this.runLots}}>Create 10,000 rows</button>
              </div>
              <div class="col-sm-6 smallpad">
                <button type="button" class="btn btn-primary btn-block" id="add" {{on "click" this.add}}>Append 1,000 rows</button>
              </div>
              <div class="col-sm-6 smallpad">
                <button type="button" class="btn btn-primary btn-block" id="update" {{on "click" this.update}}>Update every 10th row</button>
              </div>
              <div class="col-sm-6 smallpad">
                <button type="button" class="btn btn-primary btn-block" id="clear" {{on "click" this.clear}}>Clear</button>
              </div>
              <div class="col-sm-6 smallpad">
                <button type="button" class="btn btn-primary btn-block" id="swaprows" {{on "click" this.swapRows}}>Swap Rows</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <table class="table table-hover table-striped test-data">
        <tbody id="tbody">
          {{#each this.data key="id" as |item|}}
            <tr class={{if (eq this.selected item.id) "danger" ""}}>
              <td class="col-md-1">{{item.id}}</td>
              <td class="col-md-4">
                <a class="lbl" {{on "click" (fn this.select item.id)}}>{{item.label}}</a>
              </td>
              <td class="col-md-1">
                <a class="remove" {{on "click" (fn this.remove item.id)}}>
                  <span class="glyphicon glyphicon-remove" aria-hidden="true"></span>
                </a>
              </td>
              <td class="col-md-6"></td>
            </tr>
          {{/each}}
        </tbody>
      </table>
      <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
    </div>
  </template>
}
