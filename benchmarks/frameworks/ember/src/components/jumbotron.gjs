import { state } from '../state.js';
import { on } from '@ember/modifier';

export const PaddedButton = <template>
  <div class="col-sm-6 smallpad">
    <button
      type="button"
      class="btn btn-primary btn-block"
      ...attributes
    >{{yield}}</button>
  </div>
</template>;

export const Jumbotron = <template>
  <div class="jumbotron">
    <div class="row">
      <div class="col-md-6">
        <h1>Ember 7.2 (keyed)</h1>
      </div>
      <div class="col-md-6">
        <div class="row">
          <PaddedButton id="run" {{on "click" state.create}}>
            Create 1,000 rows
          </PaddedButton>
          <PaddedButton id="runlots" {{on "click" state.runLots}}>
            Create 10,000 rows
          </PaddedButton>
          <PaddedButton id="add" {{on "click" state.add}}>
            Append 1,000 rows
          </PaddedButton>
          <PaddedButton id="update" {{on "click" state.update}}>
            Update every 10th row
          </PaddedButton>
          <PaddedButton id="clear" {{on "click" state.clear}}>
            Clear
          </PaddedButton>
          <PaddedButton id="swaprows" {{on "click" state.swapRows}}>
            Swap Rows
          </PaddedButton>
        </div>
      </div>
    </div>
  </div>
</template>;

