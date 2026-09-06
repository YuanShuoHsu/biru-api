import { Body, Controller, Delete, Param, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Audit } from 'src/common/decorators/audit.decorator';

import { Roles } from 'src/menus/decorators/roles.decorator';

import { UpdateSupplierDto } from './dto/create-supplier.dto';
import { SupplierResponseDto } from './dto/supplier-response.dto';
import { SuppliersService } from './suppliers.service';

@ApiTags('inventory')
@Controller('suppliers/:supplierId')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Patch()
  @Roles({ purchasing: ['update'] }, 'supplierId')
  @Audit('supplier', { param: 'supplierId' })
  @ApiOperation({ summary: '更新供應商' })
  update(
    @Param('supplierId') supplierId: string,
    @Body() dto: UpdateSupplierDto,
  ): Promise<SupplierResponseDto> {
    return this.suppliersService.update(supplierId, dto);
  }

  @Delete()
  @Roles({ purchasing: ['delete'] }, 'supplierId')
  @Audit('supplier', { param: 'supplierId' })
  @ApiOperation({ summary: '刪除供應商' })
  remove(@Param('supplierId') supplierId: string): Promise<void> {
    return this.suppliersService.remove(supplierId);
  }
}
