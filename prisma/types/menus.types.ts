import { LocalizedText } from './locale.types';

interface RecipeItem {
  id: string;
  name: LocalizedText;
  createdAt: string;
  unit: LocalizedText;
  usage: number;
  updatedAt: string;
}

interface Choice {
  id: string;
  name: LocalizedText;
  createdAt: string;
  extraCost: number;
  isActive: boolean;
  isShared: boolean;
  recipes: RecipeItem[];
  sold: number;
  stock: number | null;
  updatedAt: string;
}

interface Option {
  id: string;
  name: LocalizedText;
  choices: Choice[];
  createdAt: string;
  multiple: boolean;
  required: boolean;
  updatedAt: string;
}

interface MenuItem {
  id: string;
  name: LocalizedText;
  createdAt: string;
  description: LocalizedText;
  imageUrl: string;
  isActive: boolean;
  options: Option[];
  price: number;
  recipes: RecipeItem[];
  sold: number;
  stock: number | null;
  updatedAt: string;
}

export interface Menu {
  id: string;
  name: LocalizedText;
  createdAt: string;
  items: MenuItem[];
  updatedAt: string;
}
