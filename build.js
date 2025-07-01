import esbuild from 'esbuild';
import alias from 'esbuild-plugin-alias';
import dtsPlugin from 'esbuild-plugin-d.ts';
import { nodeModulesPolyfillPlugin } from 'esbuild-plugins-node-modules-polyfill';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Paths
const projectRoot = __dirname;
const srcDir = path.resolve(projectRoot, 'src');
const distDir = path.resolve(projectRoot, 'dist');
const typesDir = path.resolve(distDir, 'types');

// Shared build settings
const sharedConfig = {
	entryPoints: [path.resolve(srcDir, 'index.ts')],
	bundle: true,
	sourcemap: true,
	minify: true,
	target: ['node14'], // adjust as needed
};

// Node CJS build
const nodeCjsConfig = {
	...sharedConfig,
	platform: 'node',
	format: 'cjs',
	outfile: path.resolve(distDir, 'index.cjs'),
	define: {
		'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
	},
	external: ['process', 'stream/promises', '@dha-team/arbundles', 'http-message-signatures'],
	plugins: [dtsPlugin({ outDir: typesDir })],
};

// Node ESM build
const nodeEsmConfig = {
	...nodeCjsConfig,
	format: 'esm',
	outfile: path.resolve(distDir, 'index.js'),
	external: ['process', 'stream/promises', '@dha-team/arbundles', 'http-message-signatures'],
};

// Browser ESM build
const browserConfig = {
	...sharedConfig,
	platform: 'browser',
	format: 'esm',
	outfile: path.resolve(distDir, 'index.esm.js'),
	define: {
		'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
	},
	external: ['fs', 'os', 'path', 'http', 'https', 'zlib'],
	plugins: [
		alias({
			'node:process': require.resolve('process/browser'),
			crypto: require.resolve('crypto-browserify'),
			'node:crypto': require.resolve('crypto-browserify'),
			// 'buffer': require.resolve('buffer/'),
		}),
		nodeModulesPolyfillPlugin({
			globals: { process: true, Buffer: true },
			modules: { crypto: true, stream: true, events: true, util: true, buffer: true },
		}),
		dtsPlugin({ outDir: typesDir }),
	],
};

// Build execution
(async () => {
	try {
		const configs = [nodeCjsConfig, nodeEsmConfig]; // browserConfig
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
