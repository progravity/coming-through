<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use JamesGifford\Auth\Models\Account as BaseAccount;

/**
 * Published Account model. Extends the package base model; edit
 * the fillable fields and public ID prefix here. Relationships, soft deletes,
 * events, and other behavior are inherited from the base model.
 */
#[Fillable(['name', 'owner_id'])]
class Account extends BaseAccount
{
    public function publicIdPrefix(): string
    {
        return 'account';
    }
}
