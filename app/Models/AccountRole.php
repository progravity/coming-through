<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use JamesGifford\Auth\Models\AccountRole as BaseAccountRole;

/**
 * Published AccountRole model. Extends the package base model; edit
 * the fillable fields and casts here. Relationships, soft deletes,
 * events, and other behavior are inherited from the base model.
 */
#[Fillable(['key', 'name', 'description', 'system', 'sort_order'])]
class AccountRole extends BaseAccountRole
{
    protected function casts(): array
    {
        return [
            'system' => 'boolean',
            'sort_order' => 'integer',
        ];
    }
}
