import esbuild from 'esbuild';
import alias from 'esbuild-plugin-alias';
import dtsPlugin from 'esbuild-plugin-d.ts';
import { nodeModulesPolyfillPlugin } from 'esbuild-plugins-node-modules-polyfill';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const projectRoot = __dirname;
const srcDir = path.resolve(projectRoot, 'src');
const distDir = path.resolve(projectRoot, 'dist');
const typesDir = path.resolve(distDir, 'types');

const sharedConfig = {
	entryPoints: [path.resolve(srcDir, 'index.ts')],
	bundle: true,
	sourcemap: true,
	minify: true,
	target: ['es2020'],
};

const nodeAlias = alias({
  signers: path.resolve(srcDir, 'signers/common.ts'),
});

const browserAlias = alias({
  signers: path.resolve(srcDir, 'signers/browser.ts'),
});

const nodeCjsConfig = {
	...sharedConfig,
	platform: 'node',
	format: 'cjs',
	outfile: path.resolve(distDir, 'index.cjs'),
	define: {
		'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
	},
	external: ['process', 'stream/promises', '@dha-team/arbundles', 'http-message-signatures'],
	plugins: [nodeAlias, dtsPlugin({ outDir: typesDir })],
};

const nodeEsmConfig = {
	...nodeCjsConfig,
	format: 'esm',
	outfile: path.resolve(distDir, 'index.js')
};

const browserConfig = {
	...sharedConfig,
	platform: 'browser',
	format: 'esm',
	plugins: [
		browserAlias,
		nodeModulesPolyfillPlugin({
			modules: {
				crypto: true,
				constants: true,
				events: true,
				stream: true
			}
		}),
		alias({
			crypto: require.resolve('crypto-browserify'),
			constants: require.resolve('constants-browserify'),
			stream: require.resolve('stream-browserify'),
			process: require.resolve('process/browser'),
		})
	],
	bundle: true,
	minify: true,
	outfile: path.resolve(distDir, 'index.esm.js'),
	external: ['fs', 'os', 'path', 'http', 'https', 'zlib'],
};

(async () => {
	try {
		const configs = [nodeCjsConfig, nodeEsmConfig, browserConfig];
		for (const cfg of configs) {
			console.log(`Building ${path.relative(projectRoot, cfg.outfile)} (${cfg.platform}/${cfg.format})...`);
			await esbuild.build(cfg);
		}
		console.log('Build complete!');
	} catch (err) {
		console.error('Build failed:', err);
		process.exit(1);
	}
})();
