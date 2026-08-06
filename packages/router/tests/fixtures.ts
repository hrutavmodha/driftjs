import { parseTemplate, generate } from '@driftjs/compiler';
import type { DriftJSComponent } from '@driftjs/runtime';

/** Compiles a template string into a real, runnable DriftJSComponent (no mocking of the VM). */
export function compileComponent(template: string): DriftJSComponent {
  const ast = parseTemplate(template);
  const program = generate(ast);
  return { program };
}

export const HomePage = compileComponent('<h1>Home</h1>');
export const AboutPage = compileComponent('<h1>About</h1>');
export const NotFoundPage = compileComponent('<h1>Not Found</h1>');

export const LayoutPage = compileComponent(
  '<div class="layout"><nav>Layout Nav</nav><div data-drift-outlet></div></div>'
);
export const DashboardOverview = compileComponent('<p>Overview</p>');
export const DashboardSettings = compileComponent('<p>Settings</p>');
