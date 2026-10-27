import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Controller, Get } from '@nestjs/common';
import {
  ApiExtraModels,
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import { CreateOfferDto } from './create-offer.dto.js';
import { UpdateMenuItemDto } from './update-menu-item.dto.js';
import { UpdateMenuSectionDto } from './update-menu-section.dto.js';
import { UpdateMenuDto } from './update-menu.dto.js';
import { UpdateModifierDto } from './update-modifier.dto.js';
import { CreateModifierDto } from './create-modifier.dto.js';

const errorsOf = async (cls: new () => object, fields: object) =>
  (await validate(plainToInstance(cls, fields))).map(
    ({ property }) => property,
  );

@Controller()
@ApiExtraModels(
  CreateModifierDto,
  CreateOfferDto,
  UpdateMenuDto,
  UpdateMenuItemDto,
  UpdateMenuSectionDto,
  UpdateModifierDto,
)
class NullableFieldsController {
  @Get()
  find() {}
}

const schemasOf = async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [NullableFieldsController],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  const schemas =
    SwaggerModule.createDocument(app, new DocumentBuilder().build()).components
      ?.schemas ?? {};
  await app.close();
  return schemas as Record<
    string,
    { properties: Record<string, { nullable?: boolean }> }
  >;
};

describe('menu DTO fields cleared with null', () => {
  it.each([
    [UpdateMenuDto, { image: null }],
    [UpdateMenuSectionDto, { image: null }],
    [
      UpdateMenuItemDto,
      {
        image: null,
        offer: {
          price: '100',
          availableHours: null,
          deliveryLeadTimeMinutes: null,
          inventoryLevel: null,
          priceSpecification: null,
        },
      },
    ],
    [UpdateModifierDto, { priceAdjustment: null }],
  ] as const)('%o accepts null', async (cls, fields) => {
    expect(await errorsOf(cls, fields)).toEqual([]);
  });

  it.each([
    [UpdateMenuDto, 'image'],
    [UpdateMenuSectionDto, 'image'],
    [UpdateMenuItemDto, 'image'],
    [CreateOfferDto, 'availableHours'],
    [CreateOfferDto, 'deliveryLeadTimeMinutes'],
    [CreateOfferDto, 'inventoryLevel'],
    [CreateOfferDto, 'priceSpecification'],
    [CreateModifierDto, 'priceAdjustment'],
    [UpdateModifierDto, 'priceAdjustment'],
  ] as const)('%o.%s is documented as nullable', async (cls, property) => {
    const schemas = await schemasOf();
    expect(schemas[cls.name].properties[property].nullable).toBe(true);
  });
});
