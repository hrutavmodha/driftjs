import { createRouter, createWebHashHistory } from 'driftjs-router';
// @ts-ignore
import HomeView from './views/HomeView.drift';
// @ts-ignore
import DocsLayout from './views/DocsLayout.drift';
// @ts-ignore
import DocsIntro from './views/DocsIntro.drift';
// @ts-ignore
import DocsVM from './views/DocsVM.drift';
// @ts-ignore
import DocsReactivity from './views/DocsReactivity.drift';
// @ts-ignore
import DocsRouter from './views/DocsRouter.drift';
// @ts-ignore
import DocsSSR from './views/DocsSSR.drift';
// @ts-ignore
import PioneersListView from './views/PioneersListView.drift';
// @ts-ignore
import PioneerDetailView from './views/PioneerDetailView.drift';
// @ts-ignore
import BenchmarksView from './views/BenchmarksView.drift';
// @ts-ignore
import RoadmapView from './views/RoadmapView.drift';
// @ts-ignore
import NotFoundView from './views/NotFoundView.drift';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/docs',
      component: DocsLayout,
      children: [
        { path: '', redirect: '/docs/intro' },
        { path: 'intro', name: 'docs-intro', component: DocsIntro },
        { path: 'vm', name: 'docs-vm', component: DocsVM },
        { path: 'reactivity', name: 'docs-reactivity', component: DocsReactivity },
        { path: 'router', name: 'docs-router', component: DocsRouter },
        { path: 'ssr', name: 'docs-ssr', component: DocsSSR },
      ],
    },
    {
      path: '/pioneers',
      name: 'pioneers',
      component: PioneersListView,
    },
    {
      path: '/pioneers/:id',
      name: 'pioneer-detail',
      component: PioneerDetailView,
    },
    {
      path: '/benchmarks',
      name: 'benchmarks',
      component: BenchmarksView,
    },
    {
      path: '/roadmap',
      name: 'roadmap',
      component: RoadmapView,
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFoundView,
    },
  ],
});
