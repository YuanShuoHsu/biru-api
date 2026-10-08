import { ApiPropertyOptional } from '@nestjs/swagger';

import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export const WAITLIST_TICKET_STRING_FILTER_FIELDS = [
  'ticketNumber',
  'name',
  'phoneNumber',
  'email',
] as const;
export const WAITLIST_TICKET_ENUM_FILTER_FIELDS = ['status'] as const;
export const WAITLIST_TICKET_NUMBER_FILTER_FIELDS = ['partySize'] as const;
export const WAITLIST_TICKET_PLAIN_DATE_FILTER_FIELDS = [
  'serviceDate',
] as const;
export const WAITLIST_TICKET_DATE_FILTER_FIELDS = [
  'createdAt',
  'calledAt',
  'endedAt',
] as const;
export const WAITLIST_TICKET_ALL_FILTER_FIELDS = [
  ...WAITLIST_TICKET_STRING_FILTER_FIELDS,
  ...WAITLIST_TICKET_ENUM_FILTER_FIELDS,
  ...WAITLIST_TICKET_NUMBER_FILTER_FIELDS,
  ...WAITLIST_TICKET_PLAIN_DATE_FILTER_FIELDS,
  ...WAITLIST_TICKET_DATE_FILTER_FIELDS,
] as const;

export type WaitlistTicketFilterField =
  (typeof WAITLIST_TICKET_ALL_FILTER_FIELDS)[number];

export const WAITLIST_TICKET_SORT_FIELDS = WAITLIST_TICKET_ALL_FILTER_FIELDS;

export type WaitlistTicketSortField =
  (typeof WAITLIST_TICKET_SORT_FIELDS)[number];

export class WaitlistTicketPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: WAITLIST_TICKET_ALL_FILTER_FIELDS,
    enumName: 'WaitlistTicketFilterField',
  })
  @IsOptional()
  @IsIn(WAITLIST_TICKET_ALL_FILTER_FIELDS)
  filterField?: WaitlistTicketFilterField;

  @ApiPropertyOptional({
    enum: WAITLIST_TICKET_SORT_FIELDS,
    enumName: 'WaitlistTicketSortField',
  })
  @IsOptional()
  @IsIn(WAITLIST_TICKET_SORT_FIELDS)
  sortBy?: WaitlistTicketSortField;
}
