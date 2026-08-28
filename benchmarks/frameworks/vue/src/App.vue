<script setup>
import { shallowRef, ref } from 'vue';

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

const data = shallowRef([]);
const selected = ref(0);

function run() {
  data.value = buildData(1000);
  selected.value = 0;
}

function runLots() {
  data.value = buildData(10000);
  selected.value = 0;
}

function add() {
  data.value = data.value.concat(buildData(1000));
}

function update() {
  const d = data.value.slice();
  for (let i = 0; i < d.length; i += 10) {
    const item = d[i];
    d[i] = { id: item.id, label: item.label + ' !!!' };
  }
  data.value = d;
}

function clear() {
  data.value = [];
  selected.value = 0;
}

function swapRows() {
  if (data.value.length > 998) {
    const d = data.value.slice();
    const temp = d[1];
    d[1] = d[998];
    d[998] = temp;
    data.value = d;
  }
}

function select(id) {
  selected.value = id;
}

function remove(id) {
  const idx = data.value.findIndex(d => d.id === id);
  if (idx !== -1) {
    const d = data.value.slice();
    d.splice(idx, 1);
    data.value = d;
  }
}
</script>

<template>
  <div class="container">
    <div class="jumbotron">
      <div class="row">
        <div class="col-md-6">
          <h1>Vue 3.5 (keyed)</h1>
        </div>
        <div class="col-md-6">
          <div class="row">
            <div class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" id="run" @click="run">Create 1,000 rows</button>
            </div>
            <div class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" id="runlots" @click="runLots">Create 10,000 rows</button>
            </div>
            <div class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" id="add" @click="add">Append 1,000 rows</button>
            </div>
            <div class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" id="update" @click="update">Update every 10th row</button>
            </div>
            <div class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" id="clear" @click="clear">Clear</button>
            </div>
            <div class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" id="swaprows" @click="swapRows">Swap Rows</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <table class="table table-hover table-striped test-data">
      <tbody id="tbody">
        <tr v-for="item in data" :key="item.id" :class="{ danger: selected === item.id }">
          <td class="col-md-1">{{ item.id }}</td>
          <td class="col-md-4">
            <a class="lbl" @click="select(item.id)">{{ item.label }}</a>
          </td>
          <td class="col-md-1">
            <a class="remove" @click="remove(item.id)">
              <span class="glyphicon glyphicon-remove" aria-hidden="true"></span>
            </a>
          </td>
          <td class="col-md-6"></td>
        </tr>
      </tbody>
    </table>
    <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
  </div>
</template>
