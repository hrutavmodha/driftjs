import { state } from '../state.js';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';

export const TheTable = <template>
  <table class="table table-hover table-striped test-data">
    <tbody id="tbody">
      {{#each state.data as |row|}}
        <tr class={{if row.selected "danger" ""}}>
          <td class="col-md-1">{{row.id}}</td>
          <td class="col-md-4">
            <a class="lbl" {{on "click" (fn state.select row.id)}}>{{row.label}}</a>
          </td>
          <td class="col-md-1">
            <a class="remove" {{on "click" (fn state.remove row.id)}}>
              <span class="glyphicon glyphicon-remove" aria-hidden="true"></span>
            </a>
          </td>
          <td class="col-md-6"></td>
        </tr>
      {{/each}}
    </tbody>
  </table>
</template>;

