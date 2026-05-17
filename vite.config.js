import { defineConfig } from 'vite';

// GitHub Pages serves a project repo from a sub-path:
//   https://azzkaa.github.io/cottage-portfolio/
// so the built asset URLs must be prefixed with that path. In dev this
// stays '/', so `npm run dev` is unchanged. If the repo is ever renamed
// or moved to a user/custom-domain site, update (or remove) `base`.
export default defineConfig({
  base: '/cottage-portfolio/',
});
