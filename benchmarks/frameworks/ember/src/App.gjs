import { TheTable } from './components/the-table.gjs';
import { Jumbotron } from './components/jumbotron.gjs';

export const App = <template>
  <div class="container">
    <Jumbotron />
    <TheTable />
    <span
      class="preloadicon glyphicon glyphicon-remove"
      aria-hidden="true"
    ></span>
  </div>
</template>;
