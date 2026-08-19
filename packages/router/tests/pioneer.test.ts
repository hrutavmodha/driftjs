import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createRouter,
  createMemoryHistory,
  RouterView,
  RouterLink,
  RouterContext,
} from '../src/index.js';
import { compile } from 'driftjs-compiler';
import { DriftClientVM } from 'driftjs-dom';
import * as fs from 'fs';
import * as path from 'path';

describe('PioneerDetailView Integration', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  it('renders pioneer detail page when navigating to /pioneers/ada', async () => {
    const pioneerDetailSrc = `
<script>
  import { RouterContext, RouterLink } from 'driftjs-router';

  const router = RouterContext.inject();

  const pioneerDb = {
    ada: {
      name: 'Ada Lovelace',
      title: 'Countess of Lovelace, First Computer Programmer',
      icon: '👩‍💻',
      years: '1815 – 1852',
      field: 'Algorithmic Computation',
      bio: 'Augusta Ada King, Countess of Lovelace was an English mathematician and writer.',
      achievements: [
        'Wrote Note G containing the first published computer algorithm.',
        'Envisioned computers manipulating symbols.',
      ],
      quote: '"The Analytical Engine weaves algebraic patterns."'
    },
    alan: {
      name: 'Alan Turing',
      title: 'Father of Modern Computer Science',
      icon: '👨‍🔬',
      years: '1912 – 1954',
      field: 'Theoretical Computer Science',
      bio: 'Alan Mathison Turing was an English mathematician and computer scientist.',
      achievements: ['Devised the Universal Turing Machine model.'],
      quote: '"We can only see a short distance ahead."'
    }
  };

  function getPioneer() {
    if (!router || !router.currentRoute || !router.currentRoute.params) return pioneerDb.ada;
    const id = router.currentRoute.params.id || 'ada';
    return pioneerDb[id] || pioneerDb.ada;
  }

  function getPioneerId() {
    return (router && router.currentRoute && router.currentRoute.params && router.currentRoute.params.id) || 'ada';
  }

  function getActiveTab() {
    return (router && router.currentRoute && router.currentRoute.query && router.currentRoute.query.tab) || 'bio';
  }

  let pioneer = getPioneer();
  let pid = getPioneerId();
  let tab = getActiveTab();

  if (router && typeof router.subscribe === 'function') {
    router.subscribe(() => {
      pioneer = getPioneer();
      pid = getPioneerId();
      tab = getActiveTab();
    });
  }
</script>

<div class="view-container">
  <div class="header-card">
    <div class="badge-row">
      <RouterLink to="/pioneers" label="← Back to Directory" class="btn btn-outline btn-sm" />
      <span class="pill-badge pill-purple">Route: /pioneers/{pid}</span>
    </div>
    <h1 class="pioneer-heading">👤 {pioneer.name}</h1>
    <p class="subtitle">{pioneer.title} ({pioneer.years})</p>
  </div>

  <div class="profile-card">
    <div class="profile-avatar">{pioneer.icon}</div>
    <div class="profile-info">
      <div class="badge-row">
        <span class="pill-badge pill-blue">{pioneer.field}</span>
      </div>
      <blockquote class="pioneer-quote">{pioneer.quote}</blockquote>

      <div class="tab-bar">
        <RouterLink to={'/pioneers/' + pid + '?tab=bio'} label="📖 Biography" class="tab-btn" />
        <RouterLink to={'/pioneers/' + pid + '?tab=achievements'} label="🏆 Key Achievements" class="tab-btn" />
      </div>

      <div class="tab-content">
        @if tab === 'achievements' {
          <div class="achieve-box">
            <h3>Major Contributions:</h3>
            <ul class="bullet-list">
              @for ach in pioneer.achievements {
                <li>{ach}</li>
              }
            </ul>
          </div>
        } @else {
          <div class="bio-box">
            <p>{pioneer.bio}</p>
          </div>
        }
      </div>
    </div>
  </div>
</div>
    `;
    const PioneerDetailView = compile(pioneerDetailSrc);

    const history = createMemoryHistory('/pioneers/ada');
    const router = createRouter({
      history,
      routes: [
        { path: '/pioneers/:id', component: PioneerDetailView },
      ],
    });
    await router.isReady();

    const appSrc = `
      <script>
        import { RouterContext } from '../src/router.js';
        RouterContext.provide(router);
      </script>
      <div class="app">
        <RouterView />
      </div>
    `;
    const App = compile(appSrc);
    (App as any).scope = { RouterContext, RouterView, RouterLink, router };
    (PioneerDetailView as any).scope = {
      ...(PioneerDetailView as any).scope,
      RouterContext,
      RouterLink,
      router,
    };

    const vm = new DriftClientVM();
    const node = vm.execute(App, { scope: { router, RouterView, RouterLink, RouterContext }, document }) as HTMLElement;
    container.appendChild(node);

    console.log('CONTAINER HTML:', container.innerHTML);
    expect(container.textContent).toContain('Ada Lovelace');
    expect(container.textContent).toContain('Countess of Lovelace');
  });
});
