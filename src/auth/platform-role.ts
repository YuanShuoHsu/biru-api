export const isPlatformAdmin = (role: string | null | undefined) =>
  role?.split(',').includes('admin') ?? false;
