import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

export const createPGlite = () => new PGlite({ extensions: { btree_gist } });
