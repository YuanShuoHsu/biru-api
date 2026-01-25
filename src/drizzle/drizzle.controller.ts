import { Controller } from '@nestjs/common';

import { DrizzleService } from './drizzle.service';

@Controller('drizzle')
export class DrizzleController {
  constructor(private readonly drizzleService: DrizzleService) {}

  // @Post()
  // create(@Body() createDrizzleDto: CreateDrizzleDto) {
  //   return this.drizzleService.create(createDrizzleDto);
  // }

  // @Get()
  // findAll() {
  //   return this.drizzleService.findAll();
  // }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.drizzleService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateDrizzleDto: UpdateDrizzleDto) {
  //   return this.drizzleService.update(+id, updateDrizzleDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.drizzleService.remove(+id);
  // }
}
