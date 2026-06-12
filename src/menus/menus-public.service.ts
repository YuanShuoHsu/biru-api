import { Inject, Injectable } from '@nestjs/common';

import { asc, eq, isNull } from 'drizzle-orm';
import {
  DEFAULT_LANGUAGE,
  type Language,
  type LocalizedText,
} from 'src/db/schema/enums';
import {
  menu,
  menuItem,
  menuItemAddOn,
  menuItemModifierGroup,
  menuSection,
  modifier,
  offer,
  type Offer,
} from 'src/db/schema/menus';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import type { OrderMenuResponseDto } from './dto/order-menu-response.dto';

const localize = (
  text: LocalizedText | null | undefined,
  lang: Language,
): string | null => {
  if (!text) return null;

  return (
    text[lang] ||
    text[DEFAULT_LANGUAGE] ||
    Object.values(text).find(Boolean) ||
    null
  );
};

const isDiscontinued = ({
  offers,
}: {
  offers: Pick<Offer, 'availability'>[];
}): boolean => offers[0]?.availability === 'Discontinued';

@Injectable()
export class PublicMenusService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findOrderMenu(
    organizationId: string,
    lang: Language,
  ): Promise<OrderMenuResponseDto | null> {
    const orderMenu = await this.db.query.menu.findFirst({
      where: eq(menu.organizationId, organizationId),
      with: {
        menuSections: {
          where: isNull(menuSection.parentSectionId),
          orderBy: [asc(menuSection.sortOrder)],
          with: {
            menuItems: {
              orderBy: [asc(menuItem.sortOrder)],
              with: {
                offers: { orderBy: [asc(offer.createdAt)] },
                addOns: {
                  orderBy: [asc(menuItemAddOn.sortOrder)],
                  with: {
                    addOnMenuItem: {
                      with: { offers: { orderBy: [asc(offer.createdAt)] } },
                    },
                    addOnMenuSection: {
                      with: {
                        menuItems: {
                          orderBy: [asc(menuItem.sortOrder)],
                          with: {
                            offers: { orderBy: [asc(offer.createdAt)] },
                          },
                        },
                      },
                    },
                  },
                },
                modifierGroups: {
                  orderBy: [asc(menuItemModifierGroup.sortOrder)],
                  with: {
                    modifierGroup: {
                      with: {
                        modifiers: { orderBy: [asc(modifier.sortOrder)] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!orderMenu) return null;

    const sections = orderMenu.menuSections
      .map((section) => ({
        ...section,
        name: localize(section.name, lang) || '',
        description: localize(section.description, lang),
        menuItems: section.menuItems
          .filter((entry) => !isDiscontinued(entry))
          .map(({ addOns, modifierGroups, ...item }) => ({
            ...item,
            name: localize(item.name, lang) || '',
            description: localize(item.description, lang),
            addOns: addOns.map(
              ({ addOnMenuItem, addOnMenuSection, ...addOn }) => ({
                ...addOn,
                menuItems: (addOnMenuItem
                  ? [addOnMenuItem]
                  : (addOnMenuSection?.menuItems ?? [])
                )
                  .filter((entry) => !isDiscontinued(entry))
                  .map(({ id, name, image, offers }) => ({
                    id,
                    name: localize(name, lang) || '',
                    image,
                    offers,
                  })),
              }),
            ),
            modifierGroups: modifierGroups
              .map(({ sortOrder, modifierGroup: group }) => ({
                id: group.id,
                displayName: localize(group.displayName, lang) || '',
                minSelectionCount: group.minSelectionCount,
                maxSelectionCount: group.maxSelectionCount,
                sortOrder,
                modifiers: group.modifiers
                  .filter((mod) => mod.availability !== 'Discontinued')
                  .map((mod) => ({
                    ...mod,
                    displayName: localize(mod.displayName, lang) || '',
                  })),
                createdAt: group.createdAt,
                updatedAt: group.updatedAt,
              }))
              .filter(
                ({ minSelectionCount, modifiers }) =>
                  minSelectionCount > 0 || modifiers.length > 0,
              ),
          })),
      }))
      .filter(({ menuItems }) => menuItems.length > 0);

    return {
      id: orderMenu.id,
      name: localize(orderMenu.name, lang) || '',
      description: localize(orderMenu.description, lang),
      image: orderMenu.image,
      sections,
      createdAt: orderMenu.createdAt,
      updatedAt: orderMenu.updatedAt,
    };
  }
}
