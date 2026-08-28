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

const tbody = document.getElementById("tbody");
let data = [];
let selectedRow = null;

function createRow(item) {
  const tr = document.createElement("tr");
  tr.dataId = item.id;

  const td1 = document.createElement("td");
  td1.className = "col-md-1";
  td1.textContent = item.id;
  tr.appendChild(td1);

  const td2 = document.createElement("td");
  td2.className = "col-md-4";
  const a2 = document.createElement("a");
  a2.className = "lbl";
  a2.textContent = item.label;
  td2.appendChild(a2);
  tr.appendChild(td2);

  const td3 = document.createElement("td");
  td3.className = "col-md-1";
  const a3 = document.createElement("a");
  a3.className = "remove";
  const span = document.createElement("span");
  span.className = "glyphicon glyphicon-remove";
  span.setAttribute("aria-hidden", "true");
  a3.appendChild(span);
  td3.appendChild(a3);
  tr.appendChild(td3);

  const td4 = document.createElement("td");
  td4.className = "col-md-6";
  tr.appendChild(td4);

  return tr;
}

function run() {
  clear();
  data = buildData(1000);
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < data.length; i++) {
    fragment.appendChild(createRow(data[i]));
  }
  tbody.appendChild(fragment);
}

function runLots() {
  clear();
  data = buildData(10000);
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < data.length; i++) {
    fragment.appendChild(createRow(data[i]));
  }
  tbody.appendChild(fragment);
}

function add() {
  const newData = buildData(1000);
  data = data.concat(newData);
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < newData.length; i++) {
    fragment.appendChild(createRow(newData[i]));
  }
  tbody.appendChild(fragment);
}

function update() {
  for (let i = 0; i < data.length; i += 10) {
    data[i].label += " !!!";
    const row = tbody.childNodes[i];
    if (row && row.childNodes[1] && row.childNodes[1].childNodes[0]) {
      row.childNodes[1].childNodes[0].textContent = data[i].label;
    }
  }
}

function clear() {
  data = [];
  tbody.textContent = "";
  selectedRow = null;
}

function swapRows() {
  if (data.length > 998) {
    const temp = data[1];
    data[1] = data[998];
    data[998] = temp;

    const row1 = tbody.childNodes[1];
    const row998 = tbody.childNodes[998];
    const next998 = row998.nextSibling;

    tbody.insertBefore(row998, row1);
    tbody.insertBefore(row1, next998);
  }
}

tbody.addEventListener("click", (e) => {
  let target = e.target;
  if (target.matches(".glyphicon-remove")) target = target.parentNode;
  if (target.matches("a.lbl")) {
    const tr = target.closest("tr");
    if (selectedRow) {
      selectedRow.className = "";
    }
    if (selectedRow !== tr) {
      tr.className = "danger";
      selectedRow = tr;
    } else {
      selectedRow = null;
    }
  } else if (target.matches("a.remove")) {
    const tr = target.closest("tr");
    const id = tr.dataId;
    const idx = data.findIndex(d => d.id === id);
    if (idx !== -1) {
      data.splice(idx, 1);
      tbody.removeChild(tr);
    }
  }
});

document.getElementById("run").addEventListener("click", run);
document.getElementById("runlots").addEventListener("click", runLots);
document.getElementById("add").addEventListener("click", add);
document.getElementById("update").addEventListener("click", update);
document.getElementById("clear").addEventListener("click", clear);
document.getElementById("swaprows").addEventListener("click", swapRows);
