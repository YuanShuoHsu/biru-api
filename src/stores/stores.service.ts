import { Injectable } from '@nestjs/common';
import { Prisma, Store } from 'prisma/generated/client';

import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  // create(createStoreDto: CreateStoreDto) {
  //   console.log(createStoreDto);
  //   return 'This action adds a new store';
  // }

  // findAll() {
  //   return `This action returns all stores`;
  // }

  // findOne(id: number) {
  //   return `This action returns a #${id} store`;
  // }

  // update(id: number, updateStoreDto: UpdateStoreDto) {
  //   console.log(updateStoreDto);
  //   return `This action updates a #${id} store`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} store`;
  // }

  async store(
    storeWhereUniqueInput: Prisma.StoreWhereUniqueInput,
  ): Promise<Store | null> {
    return this.prisma.store.findUnique({
      where: storeWhereUniqueInput,
    });
  }

  async stores(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.StoreWhereUniqueInput;
    where?: Prisma.StoreWhereInput;
    orderBy?: Prisma.StoreOrderByWithRelationInput;
  }): Promise<Store[]> {
    const { skip, take, cursor, where, orderBy } = params;
    return this.prisma.store.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
    });
  }

  async createStore(data: Prisma.StoreCreateInput): Promise<Store> {
    return this.prisma.store.create({
      data,
    });
  }

  async updateStore(params: {
    where: Prisma.StoreWhereUniqueInput;
    data: Prisma.StoreUpdateInput;
  }): Promise<Store> {
    const { where, data } = params;
    return this.prisma.store.update({
      data,
      where,
    });
  }

  async deleteStore(where: Prisma.StoreWhereUniqueInput): Promise<Store> {
    return this.prisma.store.delete({
      where,
    });
  }
}
