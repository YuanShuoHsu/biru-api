import { ConflictException, NotFoundException } from '@nestjs/common';

import type { Request } from 'express';

import type { AuthBatchService } from '../auth/auth-batch.service.js';

import { UsersController } from './users.controller.js';
import type { UsersService } from './users.service.js';

describe('UsersController.remove', () => {
  const request = { headers: { cookie: 'session' } } as unknown as Request;

  const setup = (found: { id: string } | null) => {
    const removeUsers = vi.fn().mockResolvedValue(undefined);
    const controller = new UsersController(
      { user: vi.fn().mockResolvedValue(found) } as unknown as UsersService,
      { removeUsers } as unknown as AuthBatchService,
    );

    return { controller, removeUsers };
  };

  it('交給 better-auth 的 remove-user 刪除，回傳刪除前的使用者', async () => {
    const { controller, removeUsers } = setup({ id: 'user-1' });

    await expect(controller.remove(request, 'user-1')).resolves.toMatchObject({
      id: 'user-1',
    });
    expect(removeUsers).toHaveBeenCalledWith(request.headers, ['user-1']);
  });

  it('remove-user 拒絕時（唯一店主、有出勤紀錄）照樣拋出', async () => {
    const { controller, removeUsers } = setup({ id: 'user-1' });
    const conflict = new ConflictException();
    removeUsers.mockRejectedValue(conflict);

    await expect(controller.remove(request, 'user-1')).rejects.toBe(conflict);
  });

  it('不存在的使用者回 404，不呼叫刪除', async () => {
    const { controller, removeUsers } = setup(null);

    await expect(controller.remove(request, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(removeUsers).not.toHaveBeenCalled();
  });
});
