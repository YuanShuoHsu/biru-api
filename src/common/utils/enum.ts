// https://github.com/drizzle-team/drizzle-orm/discussions/1914

export const enumValues = <T extends object>(
  enumObj: T,
): [string, ...string[]] => Object.values(enumObj) as [string, ...string[]];
