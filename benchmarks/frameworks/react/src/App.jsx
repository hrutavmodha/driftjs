import React, { useState, useCallback } from 'react';

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

const Row = React.memo(({ item, isSelected, onSelect, onRemove }) => {
  return (
    <tr className={isSelected ? 'danger' : ''}>
      <td className="col-md-1">{item.id}</td>
      <td className="col-md-4">
        <a className="lbl" onClick={() => onSelect(item.id)}>{item.label}</a>
      </td>
      <td className="col-md-1">
        <a className="remove" onClick={() => onRemove(item.id)}>
          <span className="glyphicon glyphicon-remove" aria-hidden="true"></span>
        </a>
      </td>
      <td className="col-md-6"></td>
    </tr>
  );
});

export function App() {
  const [data, setData] = useState([]);
  const [selected, setSelected] = useState(0);

  const run = useCallback(() => {
    setData(buildData(1000));
    setSelected(0);
  }, []);

  const runLots = useCallback(() => {
    setData(buildData(10000));
    setSelected(0);
  }, []);

  const add = useCallback(() => {
    setData(prev => prev.concat(buildData(1000)));
  }, []);

  const update = useCallback(() => {
    setData(prev => {
      const d = prev.slice();
      for (let i = 0; i < d.length; i += 10) {
        const item = d[i];
        d[i] = { id: item.id, label: item.label + ' !!!' };
      }
      return d;
    });
  }, []);

  const clear = useCallback(() => {
    setData([]);
    setSelected(0);
  }, []);

  const swapRows = useCallback(() => {
    setData(prev => {
      if (prev.length > 998) {
        const d = prev.slice();
        const temp = d[1];
        d[1] = d[998];
        d[998] = temp;
        return d;
      }
      return prev;
    });
  }, []);

  const select = useCallback((id) => {
    setSelected(id);
  }, []);

  const remove = useCallback((id) => {
    setData(prev => {
      const idx = prev.findIndex(d => d.id === id);
      if (idx !== -1) {
        const d = prev.slice();
        d.splice(idx, 1);
        return d;
      }
      return prev;
    });
  }, []);

  return (
    <div className="container">
      <div className="jumbotron">
        <div className="row">
          <div className="col-md-6">
            <h1>React 19 (keyed)</h1>
          </div>
          <div className="col-md-6">
            <div className="row">
              <div className="col-sm-6 smallpad">
                <button type="button" className="btn btn-primary btn-block" id="run" onClick={run}>Create 1,000 rows</button>
              </div>
              <div className="col-sm-6 smallpad">
                <button type="button" className="btn btn-primary btn-block" id="runlots" onClick={runLots}>Create 10,000 rows</button>
              </div>
              <div className="col-sm-6 smallpad">
                <button type="button" className="btn btn-primary btn-block" id="add" onClick={add}>Append 1,000 rows</button>
              </div>
              <div className="col-sm-6 smallpad">
                <button type="button" className="btn btn-primary btn-block" id="update" onClick={update}>Update every 10th row</button>
              </div>
              <div className="col-sm-6 smallpad">
                <button type="button" className="btn btn-primary btn-block" id="clear" onClick={clear}>Clear</button>
              </div>
              <div className="col-sm-6 smallpad">
                <button type="button" className="btn btn-primary btn-block" id="swaprows" onClick={swapRows}>Swap Rows</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <table className="table table-hover table-striped test-data">
        <tbody id="tbody">
          {data.map(item => (
            <Row
              key={item.id}
              item={item}
              isSelected={selected === item.id}
              onSelect={select}
              onRemove={remove}
            />
          ))}
        </tbody>
      </table>
      <span className="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
    </div>
  );
}
