import { defineConfig, transformWithEsbuild } from 'vite';

// Temporary. The app keeps JSX in .js files (Next handles that); vite needs to
// be told, or it cannot import a component to render it.
const jsxInJs = {
  name: 'jsx-in-js',
  enforce: 'pre',
  async transform(code, id) {
    const path = id.split('?')[0];
    if (!path.endsWith('.js') || !path.includes('/app/')) return null;
    return transformWithEsbuild(code, path, { loader: 'jsx', jsx: 'automatic' });
  },
};

export default defineConfig({
  plugins: [jsxInJs],
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': new URL('.', import.meta.url).pathname.replace(/\/$/, '') } },
  test: { include: ['test/**/*.probe.test.jsx'], environment: 'node' },
});
