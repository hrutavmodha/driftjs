export interface ScaffoldOptions {
  projectName: string;
  targetDir: string;
  templateDir: string;
  renderMode?: 'csr' | 'ssr';
  autoInstall?: boolean;
  autoRun?: boolean;
  packageManager?: 'pnpm' | 'npm' | 'yarn' | 'bun';
}
