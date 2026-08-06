import './style.css';
import { createRouter } from '@driftjs/router';
import Home from './pages/Home.drift';
import User from './pages/User.drift';
import DashboardLayout from './pages/DashboardLayout.drift';
import DashboardOverview from './pages/DashboardOverview.drift';
import NotFound from './pages/NotFound.drift';

export const router = createRouter({
  root: '#app',
  routes: [
    { path: '/', component: Home },

    // Lazy-loaded: About.drift is only fetched the first time this route is visited.
    { path: '/about', component: () => import('./pages/About.drift') },

    { path: '/user/:id', component: User },

    // Layout route: DashboardLayout renders its own [data-drift-outlet], and children
    // mount into it without the layout itself being remounted between them.
    {
      path: '/dashboard',
      component: DashboardLayout,
      children: [
        { path: '', component: DashboardOverview },
        {
          path: 'settings',
          component: () => import('./pages/DashboardSettings.drift'),
          beforeEnter: (to) => {
            console.log(`[guard] entering ${to.fullPath}`);
            return true;
          }
        }
      ]
    }
  ],
  notFound: { path: '*', component: NotFound }
});
