/**
 * The default database name
 */
export const DEFAULT_DATABASE_NAME: string = "tile-cache-data";
/**
 * The default object store name of the database
 */
export const DEFAULT_OBJECT_STORE_NAME: string = "OSM";
/**
 * The default tile url (the one from OpenStreetMap)
 */
export const DEFAULT_TILE_URL: string = "http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
/**
 * The default sub domains
 */
export const DEFAULT_TILE_URL_SUB_DOMAINS: string[] = ["a", "b", "c"];
/**
 * The fallback version of your IndexedDB database
 */
export const DEFAULT_DATABASE_VERSION: number = 1;
/**
 * The default delay between downloads during the seeding process
 */
export const DEFAULT_CRAWL_DELAY: number = 500;
/**
 * The default maximum age of a cached tile (equals one week)
 */
export const DEFAULT_MAX_AGE: number = 1000 * 60 * 60 * 24 * 7; // one week
