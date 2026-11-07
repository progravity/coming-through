<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use JamesGifford\Auth\Models\AccountUser as BaseAccountUser;

/**
 * Published AccountUser model. Extends the package base model; edit
 * the fillable fields and casts here. Relationships, soft deletes,
 * events, and other behavior are inherited from the base model.
 */
#[Fillable(['account_id', 'user_id', 'account_role_id', 'joined_at'])]
class AccountUser extends BaseAccountUser
{
    protected function casts(): array
    {
        return [
            'joined_at' => 'datetime',
        ];
    }
}
