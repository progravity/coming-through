<?php

use App\Models\AccountRole;
use App\Models\User;
use JamesGifford\Auth\Database\DevDataSeeder;

/**
 * Evaluate config/jamesgifford/auth-dev.php with the CI variable set to $ci, or unset when null,
 * and return the environments it allows. Read from the file rather than from config(), so the
 * rule is checked the same way whether or not this suite is itself running under CI.
 *
 * @return list<string>
 */
function devCastEnvironments(?string $ci): array
{
    $saved = [$_SERVER['CI'] ?? null, $_ENV['CI'] ?? null, getenv('CI')];
    $set = function (?string $value): void {
        unset($_SERVER['CI'], $_ENV['CI']);
        putenv('CI');
        if ($value !== null) {
            $_SERVER['CI'] = $_ENV['CI'] = $value;
            putenv("CI={$value}");
        }
    };

    $set($ci);

    try {
        return (require config_path('jamesgifford/auth-dev.php'))['environments'];
    } finally {
        $set(null);
        [$server, $env, $putenv] = $saved;
        if ($server !== null) {
            $_SERVER['CI'] = $server;
        }
        if ($env !== null) {
            $_ENV['CI'] = $env;
        }
        if ($putenv !== false) {
            putenv("CI={$putenv}");
        }
    }
}

test('the dev cast may seed in local and nowhere else, and nowhere at all under CI', function () {
    expect(devCastEnvironments(null))->toBe(['local'])
        ->and(devCastEnvironments('true'))->toBe([]);
});

test('every path into the dev cast refuses every environment but local', function (string $environment) {
    config(['jamesgifford.auth-dev.environments' => devCastEnvironments(null)]);
    $this->app['env'] = $environment;

    expect(app(DevDataSeeder::class)->environmentAllowed())->toBeFalse();
    $this->artisan('jamesgifford:auth:seed-dev-data')->assertFailed();
})->with(['production', 'staging', 'testing', 'ci']);

test('seeding outside local creates no users at all, only the account roles', function (string $environment) {
    config(['jamesgifford.auth-dev.environments' => devCastEnvironments(null)]);
    $this->app['env'] = $environment;

    $this->artisan('db:seed', ['--force' => true])->assertSuccessful();

    expect(User::count())->toBe(0)
        ->and(AccountRole::count())->toBeGreaterThan(0);
})->with(['production', 'staging', 'testing']);

test('seeding in local creates the dev cast and the starter kit test user', function () {
    config(['jamesgifford.auth-dev.environments' => devCastEnvironments(null)]);
    $this->app['env'] = 'local';

    $this->artisan('db:seed')->assertSuccessful();

    expect(User::where('email', 'owner@dev.test')->exists())->toBeTrue()
        ->and(User::where('email', 'test@example.com')->exists())->toBeTrue();
});
