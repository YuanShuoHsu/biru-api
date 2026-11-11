import { AdminImagesController } from './admin-images.controller.js';
import type { ImageOrphansService } from './image-orphans.service.js';

describe('AdminImagesController', () => {
  it.each([
    [{}, false],
    [{ apply: false }, false],
    [{ apply: true }, true],
  ])('%o 時以 apply=%s 清理', async (body, apply) => {
    const service = {
      sweep: vi.fn(() => Promise.resolve({ applied: apply, kinds: [] })),
    };
    const controller = new AdminImagesController(
      service as unknown as ImageOrphansService,
    );

    await controller.sweep(body);

    expect(service.sweep).toHaveBeenCalledWith(apply);
  });
});
