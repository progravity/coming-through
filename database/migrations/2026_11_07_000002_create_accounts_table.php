<?php

declare(strict_types=1);

/*
 * Published by the jamesgifford/auth package (jamesgifford:auth:install).
 * This table structure is expected by the package's models and services.
 * Modify with caution — prefer a separate migration over editing this file.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use JamesGifford\Auth\PublicId\PublicId;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('accounts', function (Blueprint $table) {
            $table->id();
            $table->string('public_id', PublicId::maxLength())->unique();
            $table->string('name');
            $table->foreignId('owner_id')
                ->constrained('users')
                ->restrictOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index('owner_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('accounts');
    }
};
