import { Controller, Get } from '@nestjs/common';

import { Public } from 'src/auth/decorators/public.decorator';

import { StoreDto } from './dto/read-stores.dto';
import { StoresService } from './stores.service';

@Controller('stores')
@Public()
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  // @Post()
  // create(@Body() createStoreDto: CreateStoreDto) {
  //   return this.storesService.create(createStoreDto);
  // }

  @Get()
  findAll(): Promise<StoreDto[]> {
    return this.storesService.findAll();
  }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.storesService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateStoreDto: UpdateStoreDto) {
  //   return this.storesService.update(+id, updateStoreDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.storesService.remove(+id);
  // }
}
