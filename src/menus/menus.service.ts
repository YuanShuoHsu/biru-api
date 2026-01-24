import { Injectable } from '@nestjs/common';

import { Menu, Prisma } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class MenusService {
  constructor(private readonly prisma: PrismaService) {}

  // create(createMenuDto: CreateMenuDto) {
  //   console.log(createMenuDto);
  //   return 'This action adds a new menu';
  // }

  // findAll() {
  //   return `This action returns all menus`;
  // }

  // findOne(id: number) {
  //   return `This action returns a #${id} menu`;
  // }

  // update(id: number, updateMenuDto: UpdateMenuDto) {
  //   console.log(updateMenuDto);
  //   return `This action updates a #${id} menu`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} menu`;
  // }

  async menu(
    menuWhereUniqueInput: Prisma.MenuWhereUniqueInput,
  ): Promise<Menu | null> {
    return this.prisma.menu.findUnique({
      where: menuWhereUniqueInput,
    });
  }

  async menus(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.MenuWhereUniqueInput;
    where?: Prisma.MenuWhereInput;
    orderBy?: Prisma.MenuOrderByWithRelationInput;
    include?: Prisma.MenuInclude;
  }): Promise<Menu[]> {
    const { skip, take, cursor, where, orderBy, include } = params;
    return this.prisma.menu.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
      include,
    });
  }

  async createMenu(data: Prisma.MenuCreateInput): Promise<Menu> {
    return this.prisma.menu.create({
      data,
    });
  }

  async updateMenu(params: {
    where: Prisma.MenuWhereUniqueInput;
    data: Prisma.MenuUpdateInput;
  }): Promise<Menu> {
    const { where, data } = params;
    return this.prisma.menu.update({
      data,
      where,
    });
  }

  async deleteMenu(where: Prisma.MenuWhereUniqueInput): Promise<Menu> {
    return this.prisma.menu.delete({
      where,
    });
  }

  findAll(storeId: string) {
    return this.prisma.menu.findMany({
      where: { storeId, isActive: true },
      orderBy: { createdAt: 'asc' },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          include: {
            ingredients: {
              orderBy: { createdAt: 'asc' },
            },
            options: {
              where: { isActive: true },
              orderBy: { createdAt: 'asc' },
              include: {
                choices: {
                  where: { isActive: true },
                  orderBy: { createdAt: 'asc' },
                  include: {
                    ingredients: {
                      orderBy: { createdAt: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }
}
