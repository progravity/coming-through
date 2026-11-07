<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use JamesGifford\Auth\Database\DevDataSeeder;
use JamesGifford\Auth\Database\Seeders\AccountRoleSeeder;
use JamesGifford\Auth\Database\Seeders\ApplyIdOffsetsSeeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Auth: required account roles — ALL environments.
        $this->call(AccountRoleSeeder::class);
        // Auth: development fixtures — the seeder refuses outside
        // local/staging and always in production.
        $this->call(DevDataSeeder::class);
        // Auth: reserve low IDs for the fixtures above. No-op when no
        // offsets are configured, and on SQLite.
        $this->call(ApplyIdOffsetsSeeder::class);
        // User::factory(10)->create();

        User::factory()->create([
            'name' => 'Test User',
            'email' => 'test@example.com',
        ]);
    }
}
