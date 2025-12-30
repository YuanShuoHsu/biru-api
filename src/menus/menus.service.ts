import { Injectable } from '@nestjs/common';

import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class MenusService {
  constructor(private readonly prisma: PrismaService) {}
  // create(createMenuDto: CreateMenuDto) {
  //   console.log(createMenuDto);
  //   return 'This action adds a new menu';
  // }

  findAll(storeId: string) {
    return this.prisma.menu.findMany({
      where: { storeId, isActive: true },
      orderBy: { createdAt: 'asc' },
      include: {
        menuItems: {
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
}
