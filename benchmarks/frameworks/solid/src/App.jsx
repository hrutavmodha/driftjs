import { createSignal, For } from 'solid-js';

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
      label: createSignal(adjectives[_random(adjectives.length)] + " " + colours[_random(colours.length)] + " " + nouns[_random(nouns.length)])
    };
  }
  return data;
}

export function App() {
  const [data, setData] = createSignal([]);
  const [selected, setSelected] = createSignal(0);

  const run = () => {
    setData(buildData(1000));
    setSelected(0);
  };

  const runLots = () => {
    setData(buildData(10000));
    setSelected(0);
  };

  const add = () => {
    setData(prev => prev.concat(buildData(1000)));
  };

  const update = () => {
    const d = data();
    for (let i = 0; i < d.length; i += 10) {
      d[i].label[1](l => l + ' !!!');
    }
  };

  const clear = () => {
    setData([]);
    setSelected(0);
  };

  const swapRows = () => {
    const d = data();
    if (d.length > 998) {
      const copy = d.slice();
      const temp = copy[1];
      copy[1] = copy[998];
      copy[998] = temp;
      setData(copy);
    }
  };

  const select = (id) => {
    setSelected(id);
  };

  const remove = (id) => {
    const d = data();
    const idx = d.findIndex(row => row.id === id);
    if (idx !== -1) {
      const copy = d.slice();
      copy.splice(idx, 1);
      setData(copy);
    }
  };

  return (
    <div class="container">
      <div class="jumbotron">
        <div class="row">
          <div class="col-md-6">
            <h1>SolidJS (keyed)</h1>
          </div>
          <div class="col-md-6">
            <div class="row">
              <div class="col-sm-6 smallpad">
                <button type="button" class="btn btn-primary btn-block" id="run" onClick={run}>Create 1,000 rows</button>
              </div>
              <div class="col-sm-6 smallpad">
                <button type="button" class="btn btn-primary btn-block" id="runlots" onClick={runLots}>Create 10,000 rows</button>
              </div>
              <div class="col-sm-6 smallpad">
                <button type="button" class="btn btn-primary btn-block" id="add" onClick={add}>Append 1,000 rows</button>
              </div>
              <div class="col-sm-6 smallpad">
                <button type="button" class="btn btn-primary btn-block" id="update" onClick={update}>Update every 10th row</button>
              </div>
              <div class="col-sm-6 smallpad">
                <button type="button" class="btn btn-primary btn-block" id="clear" onClick={clear}>Clear</button>
              </div>
              <div class="col-sm-6 smallpad">
                <button type="button" class="btn btn-primary btn-block" id="swaprows" onClick={swapRows}>Swap Rows</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <table class="table table-hover table-striped test-data">
        <tbody id="tbody">
          <For each={data()}>
            {(row) => (
              <tr class={selected() === row.id ? 'danger' : ''}>
                <td class="col-md-1">{row.id}</td>
                <td class="col-md-4">
                  <a class="lbl" onClick={() => select(row.id)}>{row.label[0]()}</a>
                </td>
                <td class="col-md-1">
                  <a class="remove" onClick={() => remove(row.id)}>
                    <span class="glyphicon glyphicon-remove" aria-hidden="true"></span>
                  </a>
                </td>
                <td class="col-md-6"></td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
    </div>
  );
}
