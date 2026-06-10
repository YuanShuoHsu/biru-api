import { Inject, Injectable } from '@nestjs/common';

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
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

@Injectable()
export class PublicMenusService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findOrderMenu(
    organizationId: string,
    lang: Language,
  ): Promise<OrderMenuResponseDto[]> {
    const sections = await this.db.query.menuSection.findMany({
      where: and(
        isNull(menuSection.parentSectionId),
        inArray(
          menuSection.menuId,
          this.db
            .select({ id: menu.id })
            .from(menu)
            .where(eq(menu.organizationId, organizationId)),
        ),
      ),
      orderBy: [asc(menuSection.sortOrder)],
      with: {
        menuItems: {
          orderBy: [asc(menuItem.sortOrder)],
          with: {
            offers: true,
            addOns: {
              orderBy: [asc(menuItemAddOn.sortOrder)],
              with: {
                addOnMenuItem: { with: { offers: true } },
                addOnMenuSection: {
                  with: {
                    menuItems: {
                      orderBy: [asc(menuItem.sortOrder)],
                      with: { offers: true },
                    },
                  },
                },
              },
            },
            modifierGroups: {
              orderBy: [asc(menuItemModifierGroup.sortOrder)],
              with: {
                modifierGroup: {
                  with: { modifiers: { orderBy: [asc(modifier.sortOrder)] } },
                },
              },
            },
          },
        },
      },
    });

    return sections.map((section) => ({
      ...section,
      name: localize(section.name, lang) || '',
      description: localize(section.description, lang),
      menuItems: section.menuItems.map(
        ({ addOns, modifierGroups, ...item }) => ({
          ...item,
          name: localize(item.name, lang) || '',
          description: localize(item.description, lang),
          addOns: addOns.map(
            ({ addOnMenuItem, addOnMenuSection, ...addOn }) => ({
              ...addOn,
              menuItems: (addOnMenuItem
                ? [addOnMenuItem]
                : (addOnMenuSection?.menuItems ?? [])
              ).map(({ id, name, image, offers }) => ({
                id,
                name: localize(name, lang) || '',
                image,
                offers,
              })),
            }),
          ),
          modifierGroups: modifierGroups.map(
            ({ sortOrder, modifierGroup: group }) => ({
              id: group.id,
              displayName: localize(group.displayName, lang) || '',
              minSelectionCount: group.minSelectionCount,
              maxSelectionCount: group.maxSelectionCount,
              sortOrder,
              modifiers: group.modifiers.map((mod) => ({
                ...mod,
                displayName: localize(mod.displayName, lang) || '',
              })),
              createdAt: group.createdAt,
              updatedAt: group.updatedAt,
            }),
          ),
        }),
      ),
    }));
  }
}
