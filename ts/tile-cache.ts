import {
    getListOfTilesInBBox,
    IBBox,
    ITileCoordinates,
} from "@yaga/tile-utils";
import { Buffer } from "buffer";
import { EventEmitter } from "events";
import * as request from "request";
import {
    DEFAULT_CRAWL_DELAY,
    DEFAULT_DATABASE_NAME,
    DEFAULT_DATABASE_VERSION,
    DEFAULT_MAX_AGE,
    DEFAULT_OBJECT_STORE_NAME,
    DEFAULT_TILE_URL,
    DEFAULT_TILE_URL_SUB_DOMAINS,
} from "./consts";

/**
 * Interface for the options parameter of the constructor of the IndexedDbTileCache class
 */
export interface IIndexedDbTileCacheOptions {
    /**
     * Name of the database
     *
     * The default value is equal to the constance DEFAULT_DATABASE_NAME
     * @default "tile-cache-data"
     */
    databaseName?: string;
    /**
     * Version of the IndexedDB store. Should not be changed normally! But can provide an "upgradeneeded" event from
     * IndexedDB.
     *
     * The default value is equal to the constance DEFAULT_DATABASE_VERSION
     * @default 1
     */
    databaseVersion?: number;
    /**
     * Name of the object-store. Should correspond with the name of the tile server
     *
     * The default value is equal to the constance DEFAULT_OBJECT_STORE_NAME
     * @default "OSM";
     */
    objectStoreName?: string;
    /**
     * URL template of the tile server.
     *
     * The default value is equal to the constance DEFAULT_TILE_URL
     * @default "http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
     */
    tileUrl?: string;
    /**
     * A list of all available sub domains for the URL template.
     *
     * The default value is equal to the constance DEFAULT_TILE_URL_SUB_DOMAINS
     * @default ["a", "b", "c"]
     */
    tileUrlSubDomains?: string[];
    /**
     * The delay in milliseconds used for not stressing the tile server while seeding.
     *
     * The default value is equal to the constance DEFAULT_CRAWL_DELAY
     * @default 500
     */
    crawlDelay?: number;
    /**
     * The maximum age in milliseconds of a stored tile.
     *
     * The default value is equal to the constance DEFAULT_MAX_AGE
     * @default 1000 * 60 * 60 * 24 * 7
     */
    maxAge?: number;
}

/**
 * Interface for an internal IndexedDbTileCacheEntry
 */
export interface IIndexedDbTileCacheEntry {
    /**
     * URL of the tile excepts its sub-domain value that is still stored as placeholder.
     */
    url: string;
    /**
     * Timestamp of the creation date of the entry
     */
    timestamp: number;
    /**
     * Data stored as Uint8Array enhanced with node.js' Buffer
     */
    data: Buffer;
    /**
     * The content-type from the response header.
     */
    contentType: string;
}

/**
 * Interface for the "seed-progress" event
 */
export interface IIndexedDbTileCacheSeedProgress {
    total: number;
    remains: number;
}

/**
 * Class for a spatial-tile-cache that stores its data in the browsers IndexedDB
 */
export class IndexedDbTileCache extends EventEmitter {
    constructor(public options: IIndexedDbTileCacheOptions = {}) {
        super();
        this.options.databaseName = this.options.databaseName || DEFAULT_DATABASE_NAME;
        this.options.databaseVersion = this.options.databaseVersion || DEFAULT_DATABASE_VERSION;
        this.options.objectStoreName = this.options.objectStoreName || DEFAULT_OBJECT_STORE_NAME;
        this.options.tileUrl = this.options.tileUrl || DEFAULT_TILE_URL;
        this.options.tileUrlSubDomains = this.options.tileUrlSubDomains || DEFAULT_TILE_URL_SUB_DOMAINS;
        this.options.crawlDelay = this.options.crawlDelay || DEFAULT_CRAWL_DELAY;
        this.options.maxAge = this.options.maxAge || DEFAULT_MAX_AGE;

        // Create the store if it does not exists...
        const dbRequest: IDBOpenDBRequest = indexedDB.open(this.options.databaseName, this.options.databaseVersion);
        dbRequest.addEventListener("upgradeneeded", (dbEvent: any) => {
            /**
             * Fired event from IndexedDB to give the possibility to enhance something on the store
             * @event IndexedDbTileCache#upgradeneeded
             */
            this.emit("upgradeneeded", dbEvent);
            const database: IDBDatabase = dbEvent.target.result;
            database.createObjectStore(this.options.objectStoreName, { keyPath: "url"});
        });
        dbRequest.addEventListener("error", (dbEvent: any) => {
            /**
             * Piping the error event
             * @event IndexedDbTileCache#upgradeneeded
             */
            this.emit("error", dbEvent.target.error);
        });
    }

    /**
     * Get the internal tile entry from the database with all its additional meta information.
     *
     * If the tile is marked as outdated by the `IIndexedDbTileCacheOptions.maxAge` property, it tries to download it
     * again. On any error it will provide the cached version.
     *
     * If you pass `true` as parameter for the `downloadIfUnavaiable` argument, it tries to dowenload a tile if it is
     * not stored already.
     */
    public getTileEntry(
        tileCoordinates: ITileCoordinates,
        downloadIfUnavaiable?: boolean,
    ): Promise<IIndexedDbTileCacheEntry> {
        const dbRequest: IDBOpenDBRequest = indexedDB.open(this.options.databaseName, this.options.databaseVersion);

        return new Promise((resolve, reject) => {
            dbRequest.addEventListener("success", (dbEvent: any) => {
                const database: IDBDatabase = dbEvent.target.result;
                const tx = database.transaction([this.options.objectStoreName])
                    .objectStore(this.options.objectStoreName).get(this.createInternalTileUrl(tileCoordinates));

                tx.addEventListener("success", (event: any) => {
                    if (!event.target.result) {
                        if (downloadIfUnavaiable) {
                            return this.downloadTile(tileCoordinates).then(resolve, reject);
                        }
                        return reject(new Error("Unable to find entry"));
                    }
                    const tileEntry: IIndexedDbTileCacheEntry = event.target.result as IIndexedDbTileCacheEntry;
                    // Make a buffer from UInt8Array to get additional methods
                    if (!(tileEntry.data instanceof Buffer)) {
                        tileEntry.data = new Buffer(tileEntry.data);
                    }

                    if (tileEntry.timestamp < Date.now() - this.options.maxAge) { // Too old
                        return this.downloadTile(tileCoordinates).catch(() => {
                            // Not available so keep cached version...
                            return resolve(tileEntry as IIndexedDbTileCacheEntry);
                        }).then(resolve as (value: IIndexedDbTileCacheEntry) => void);
                    }
                    resolve(tileEntry);
                });
                tx.addEventListener("error", (event: any) => {
                    this.emit("error", dbEvent.target.error);
                    reject(event.target.error);
                });
            });

            dbRequest.addEventListener("error", (dbEvent: any) => {
                this.emit("error", dbEvent.target.error);
                reject(dbEvent.target.error);
            });
        });
    }

    /**
     * Creates an internal tile url from the url template from IIndexedDbTileCacheOptions
     *
     * It keeps the sub-domain placeholder to provide unique database entries while seeding from multiple sub-domains.
     */
    public createInternalTileUrl(tileCoordinates: ITileCoordinates): string {
        return this.options.tileUrl
            .split(/{x}/).join(tileCoordinates.x.toString())
            .split(/{y}/).join(tileCoordinates.y.toString())
            .split(/{-y}/).join(tileCoordinates.y.toString())
            .split(/{z}/).join(tileCoordinates.z.toString());
    }

    /**
     * Creates a real tile url from the url template from IIndexedDbTileCacheOptions
     */
    public createTileUrl(tileCoordinates: ITileCoordinates): string {
        const randomSubDomain: string = this.options
            .tileUrlSubDomains[Math.floor(Math.random() * this.options.tileUrlSubDomains.length)];

        return this.createInternalTileUrl(tileCoordinates)
            .split(/{s}/).join(randomSubDomain);
    }

    /**
     * Receive a tile as an Uint8Array / Buffer
     */
    public getTileAsBuffer(tileCoordinates: ITileCoordinates): Promise<Buffer> {
        return this.getTileEntry(tileCoordinates, true).then((tileEntry: IIndexedDbTileCacheEntry) => {
            return Promise.resolve(tileEntry.data);
        });
    }

    /**
     * Receives a tile as its base64 encoded data url.
     */
    public getTileAsDataUrl(tileCoordinates: ITileCoordinates): Promise<string> {
        return this.getTileEntry(tileCoordinates, true).then((tileEntry: IIndexedDbTileCacheEntry) => {
            return Promise.resolve("data:" + tileEntry.contentType + ";base64," + tileEntry.data.toString("base64"));
        });
    }

    /**
     * Download a specific tile by its coordinates and store it within the indexed-db
     */
    public downloadTile(tileCoordinates: ITileCoordinates): Promise<IIndexedDbTileCacheEntry> {
        const buffers: Buffer[] = [];
        return new Promise((resolve, reject) => {
            let contentType: string = "";
            request.get(this.createTileUrl(tileCoordinates))
                .on("data", (chunk: Buffer) => {
                    buffers.push(chunk);
                })
                .on("response", (response) => {
                    contentType = response.headers["content-type"] as string;
                })
                .on("error", reject)
                .on("end", () => {
                    const dbRequest: IDBOpenDBRequest = indexedDB.open(
                        this.options.databaseName,
                        this.options.databaseVersion,
                    );

                    const tileCacheEntry: IIndexedDbTileCacheEntry = {
                        contentType,
                        data: Buffer.concat(buffers),
                        timestamp: Date.now(),
                        url: this.createInternalTileUrl(tileCoordinates),
                    };

                    dbRequest.addEventListener("success", (dbEvent: any) => {
                        const database: IDBDatabase = dbEvent.target.result;
                        const tx = database.transaction([this.options.objectStoreName], "readwrite")
                            .objectStore(this.options.objectStoreName).put(tileCacheEntry);

                        tx.addEventListener("success", () => {
                            resolve(tileCacheEntry);
                        });
                        tx.addEventListener("error", (event: any) => {
                            this.emit("error", event.target.error);
                            reject(event.target.error);
                        });
                    });

                    dbRequest.addEventListener("error", (dbEvent: any) => {
                        this.emit("error", dbEvent.target.error);
                        reject(dbEvent.target.error);
                    });
                });
        });
    }

    /**
     * Seeds an area of tiles by the given bounding box, the maximal z value and the optional minimal z value.
     *
     * The returned number in the promise is equal to the duration of the operation in milliseconds.
     */
    public seedBBox(bbox: IBBox, maxZ: number, minZ: number = 0, tms: boolean = false): Promise<number> {
        const start = Date.now();
        const list: ITileCoordinates[] = getListOfTilesInBBox(bbox, maxZ, minZ, tms);
        const total: number = list.length;
        return new Promise((resolve, reject) => {
            const fn = () => {
                /**
                 * @event IndexedDbTileCache#seed-progess
                 * @type IIndexedDbTileCacheSeedProgress
                 */
                this.emit("seed-progress", {total, remains: list.length} as IIndexedDbTileCacheSeedProgress);
                const val: ITileCoordinates = list.shift();
                if (val) {
                    this.downloadTile(val).then(() => {
                        setTimeout(fn, this.options.crawlDelay);
                    }, reject);
                    return;
                }
                resolve(Date.now() - start);
            };
            fn();
        });
    }

    /**
     * Purge the whole store
     */
    public purgeStore(): Promise<boolean> {
        const dbRequest: IDBOpenDBRequest = indexedDB.open(this.options.databaseName, this.options.databaseVersion);

        return new Promise((resolve, reject) => {
            dbRequest.addEventListener("success", (dbEvent: any) => {
                const database: IDBDatabase = dbEvent.target.result;
                const tx = database.transaction([this.options.objectStoreName], "readwrite")
                    .objectStore(this.options.objectStoreName).clear();

                tx.addEventListener("success", (/* event: any */) => {
                    resolve(true);
                });
                tx.addEventListener("error", (event: any) => {
                    this.emit("error", dbEvent.target.error);
                    reject(event.target.error);
                });
            });

            dbRequest.addEventListener("error", (dbEvent: any) => {
                this.emit("error", dbEvent.target.error);
            });
        });
    }
}
