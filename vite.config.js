import tailwindcss from '@tailwindcss/vite';
import laravel from 'laravel-vite-plugin';
import { bunny } from 'laravel-vite-plugin/fonts';
import { networkInterfaces } from 'node:os';
import { defineConfig, lazyPlugins } from 'vite-plus';

/**
 * Phone testing over the local network (`composer run dev:lan`). Vite listens on every interface
 * and writes this machine's LAN address into public/hot, so a page served by
 * `php artisan serve --host=0.0.0.0` asks for its scripts somewhere a phone can reach. Set
 * VITE_LAN_HOST to choose the address when the machine has more than one.
 *
 * Plain HTTP on purpose: with the site secured in Herd the Laravel plugin would otherwise serve
 * Vite with the coming-through.test certificate, which a phone reaching an IP address rejects.
 */
function lanServer() {
    if (process.env.VITE_LAN !== '1') {
        return {};
    }

    const host = process.env.VITE_LAN_HOST
        ?? Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;

    if (!host) {
        throw new Error('VITE_LAN=1 but no LAN address was found; set VITE_LAN_HOST to this machine\'s IP.');
    }

    return { host: '0.0.0.0', https: false, hmr: { host } };
}

export default defineConfig({
    plugins: lazyPlugins(() => [
        laravel({
            input: [
                'resources/css/app.css',
                'resources/js/app.js',
                'resources/js/passkeys.js',
                'resources/css/game.css',
                'resources/js/game/main.ts',
                // The labs: one stylesheet, and an entry per lab (resources/views/labs/*.blade.php).
                'resources/css/lab.css',
                'resources/js/game/labs/people/main.ts',
                'resources/js/game/labs/fixtures/main.ts',
                'resources/js/game/labs/buildings/main.ts',
            ],
            refresh: true,
            fonts: [
                bunny('Instrument Sans', {
                    weights: [400, 500, 600],
                }),
            ],
        }),
        tailwindcss(),
    ]),
    build: {
        // three.js alone is about 600 kB minified, so the game bundle is expected to be large.
        chunkSizeWarningLimit: 1024,
    },
    server: {
        cors: true,
        ...lanServer(),
        watch: {
            ignored: [
                '**/.agents/**',
                '**/.claude/**',
                '**/.cursor/**',
                '**/.junie/**',
                '**/storage/framework/views/**',
                '**/vendor/**',
            ],
        },
    },
});
