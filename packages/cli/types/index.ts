export interface ScaffoldOptions {
  projectName: string;
  targetDir: string;
  templateDir: string;
  renderMode?: 'csr' | 'ssr';
  overwriteMode?: 'empty' | 'ignore';
  autoInstall?: boolean;
  autoRun?: boolean;
  packageManager?: 'pnpm' | 'npm' | 'yarn' | 'bun';
}
