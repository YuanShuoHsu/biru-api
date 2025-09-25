import { Injectable } from '@nestjs/common';

import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  // create(createStoreDto: CreateStoreDto) {
  //   console.log(createStoreDto);
  //   return 'This action adds a new store';
  // }

  findAll() {
    return this.prisma.store.findMany();
  }

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
}
