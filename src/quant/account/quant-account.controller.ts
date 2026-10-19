import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { AdminGuard } from 'src/common/guards/admin.guard';

import {
  CreateQuantCredentialDto,
  CreateQuantTransferDto,
  PlaceQuantOrderDto,
  PlaceQuantOrderResponseDto,
  QuantAssetsDto,
  QuantBalanceDto,
  QuantCredentialDto,
  QuantFillDto,
  QuantFillPageDto,
  QuantHistoryQueryDto,
  QuantOrderDto,
  QuantOrderPageDto,
  QuantSymbolQueryDto,
  QuantTransferPageDto,
  QuantTransferQueryDto,
} from '../dto/quant-account.dto';

import { QuantAccountService } from './quant-account.service';

// 金鑰只屬於綁定者本人，平台管理員彼此也看不到
@ApiTags('quant')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('quant/credentials')
export class QuantAccountController {
  constructor(private readonly account: QuantAccountService) {}

  @Get()
  @ApiOperation({ summary: '列出自己綁定的交易所 API key' })
  findAll(@Session() { user }: UserSession): Promise<QuantCredentialDto[]> {
    return this.account.listCredentials(user.id);
  }

  @Post()
  @ApiOperation({ summary: '綁定交易所 API key（會先向交易所驗證）' })
  create(
    @Body() dto: CreateQuantCredentialDto,
    @Session() { user }: UserSession,
  ): Promise<QuantCredentialDto> {
    return this.account.createCredential(user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: '解除綁定交易所 API key' })
  remove(
    @Param('id') id: string,
    @Session() { user }: UserSession,
  ): Promise<void> {
    return this.account.removeCredential(user.id, id);
  }

  @Get(':id/balances')
  @ApiOperation({ summary: '取得交易帳戶餘額' })
  findBalances(
    @Param('id') id: string,
    @Session() { user }: UserSession,
  ): Promise<QuantBalanceDto[]> {
    return this.account.listBalances(user.id, id);
  }

  @Get(':id/open-orders')
  @ApiOperation({ summary: '取得交易對的未完成委託' })
  findOpenOrders(
    @Param('id') id: string,
    @Query() { symbol }: QuantSymbolQueryDto,
    @Session() { user }: UserSession,
  ): Promise<QuantOrderDto[]> {
    return this.account.listOpenOrders(user.id, id, symbol);
  }

  @Delete(':id/open-orders')
  @HttpCode(204)
  @ApiOperation({ summary: '撤銷交易對的全部未完成委託' })
  cancelAll(
    @Param('id') id: string,
    @Query() { symbol }: QuantSymbolQueryDto,
    @Session() { user }: UserSession,
  ): Promise<void> {
    return this.account.cancelAllOrders(user.id, id, symbol);
  }

  @Get(':id/orders')
  @ApiOperation({ summary: '取得交易對的手動委託紀錄（依時間由新到舊分頁）' })
  findOrders(
    @Param('id') id: string,
    @Query() query: QuantHistoryQueryDto,
    @Session() { user }: UserSession,
  ): Promise<QuantOrderPageDto> {
    return this.account.listOrders(user.id, id, query);
  }

  @Post(':id/orders')
  @ApiOperation({ summary: '下單（實盤）' })
  placeOrder(
    @Param('id') id: string,
    @Body() dto: PlaceQuantOrderDto,
    @Session() { user }: UserSession,
  ): Promise<PlaceQuantOrderResponseDto> {
    return this.account.placeOrder(user.id, id, dto);
  }

  @Delete(':id/orders/:orderId')
  @HttpCode(204)
  @ApiOperation({ summary: '撤銷委託' })
  cancelOrder(
    @Param('id') id: string,
    @Param('orderId') orderId: string,
    @Query() { symbol }: QuantSymbolQueryDto,
    @Session() { user }: UserSession,
  ): Promise<void> {
    return this.account.cancelOrder(user.id, id, symbol, orderId);
  }

  @Get(':id/orders/:orderId/fills')
  @ApiOperation({ summary: '取得一筆委託的成交明細' })
  findOrderFills(
    @Param('id') id: string,
    @Param('orderId') orderId: string,
    @Query() { symbol }: QuantSymbolQueryDto,
    @Session() { user }: UserSession,
  ): Promise<QuantFillDto[]> {
    return this.account.listOrderFills(user.id, id, symbol, orderId);
  }

  @Get(':id/fills')
  @ApiOperation({ summary: '取得交易對的手動成交紀錄（依時間由新到舊分頁）' })
  findFills(
    @Param('id') id: string,
    @Query() query: QuantHistoryQueryDto,
    @Session() { user }: UserSession,
  ): Promise<QuantFillPageDto> {
    return this.account.listFills(user.id, id, query);
  }

  @Get(':id/assets')
  @ApiOperation({ summary: '取得現貨與合約帳戶的總資產估值' })
  findAssets(
    @Param('id') id: string,
    @Session() { user }: UserSession,
  ): Promise<QuantAssetsDto> {
    return this.account.findAssets(user.id, id);
  }

  @Get(':id/transfers')
  @ApiOperation({
    summary: '取得現貨與合約帳戶間的劃轉紀錄（依時間由新到舊分頁）',
  })
  findTransfers(
    @Param('id') id: string,
    @Query() query: QuantTransferQueryDto,
    @Session() { user }: UserSession,
  ): Promise<QuantTransferPageDto> {
    return this.account.listTransfers(user.id, id, query);
  }

  @Post(':id/transfers')
  @HttpCode(204)
  @ApiOperation({ summary: '在現貨與合約帳戶間劃轉資金' })
  createTransfer(
    @Param('id') id: string,
    @Body() dto: CreateQuantTransferDto,
    @Session() { user }: UserSession,
  ): Promise<void> {
    return this.account.createTransfer(user.id, id, dto);
  }
}
