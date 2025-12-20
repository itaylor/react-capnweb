/// <reference lib="deno.ns" />
// Build script for creating npm package from Deno module
// Run with: deno run -A scripts/build_npm.ts

import { build, emptyDir } from '@dnt/mod';
import denoJson from '../deno.json' with { type: 'json' };

await emptyDir('./npm');

await build({
  entryPoints: ['./react-capnweb.tsx'],
  outDir: './npm',
  shims: {
    deno: false,
    custom: [
      {
        package: {
          name: 'globalThis',
          version: '1.0.0',
        },
        globalNames: ['globalThis'],
      },
    ],
  },
  package: {
    name: '@itaylor/react-capnweb',
    version: denoJson.version,
    description: denoJson.description,
    keywords: [
      'react',
      'capnproto',
      'capnweb',
      'websocket',
      'rpc',
      'typescript',
      'type-safe',
      'hooks',
      'components',
      'frontend',
      'browser',
    ],
    license: 'MIT',
    author: 'itaylor',
    engines: {
      node: '>=14.0.0',
    },
    peerDependencies: {
      react: '>=19.0.0',
      'react-dom': '>=19.0.0',
      capnweb: '>=0.3.0',
    },
    devDependencies: {
      '@types/react': '^19.0.0',
      '@types/react-dom': '^19.0.0',
    },
    homepage: 'https://github.com/itaylor/react-capnweb',
    repository: {
      type: 'git',
      url: 'https://github.com/itaylor/react-capnweb.git',
    },
  },
  postBuild() {
    // Copy README and LICENSE to npm directory
    Deno.copyFileSync('README.md', 'npm/README.md');
    Deno.copyFileSync('LICENSE', 'npm/LICENSE');
    console.log('✅ README.md and LICENSE copied to npm directory');

    // Deletes the dependencies key out of the npm/package.json file.
    // This project only has peer dependencies
    const packageJsonPath = 'npm/package.json';
    const packageJson = JSON.parse(Deno.readTextFileSync(packageJsonPath));
    delete packageJson.dependencies;
    Deno.writeTextFileSync(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2),
    );
    console.log('✅ Dependencies key deleted from npm/package.json');
  },
  compilerOptions: {
    target: 'ES2020',
    lib: ['ES2020', 'DOM', 'DOM.Iterable'],
  },
  typeCheck: 'both',
  declaration: 'separate',
  scriptModule: false,
  test: false,
  mappings: {},
});

console.log('✅ npm package built successfully!');
console.log('📦 Package ready in ./npm directory');
console.log('\nTo publish:');
console.log('  cd npm');
console.log('  npm publish');
