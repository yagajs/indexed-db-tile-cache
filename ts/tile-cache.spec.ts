import { Buffer } from "buffer";
import { expect } from "chai";
import { IIndexedDbTileCacheEntry, IIndexedDbTileCacheSeedProgress, IndexedDbTileCache } from "./index";

describe("IndexedDbTileCache", () => {
    it("should create a store", () => {
        expect(new IndexedDbTileCache()).to.instanceof(IndexedDbTileCache);
    });
    it("should purge the store", (done: MochaDone) => {
        new IndexedDbTileCache().purgeStore().then(() => { done(); }, done);
    });
    it("should fulfill the default values", () => {
        const tileCache = new IndexedDbTileCache();
        expect(tileCache.options.databaseName).to.equal("tile-cache-data");
        expect(tileCache.options.databaseVersion).to.equal(1);
        expect(tileCache.options.objectStoreName).to.equal("OSM");
        expect(tileCache.options.tileUrl).to.equal("http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
        expect(tileCache.options.tileUrlSubDomains).to.deep.equal(["a", "b", "c"]);
        expect(tileCache.options.crawlDelay).to.equal(500);
        expect(tileCache.options.maxAge).to.equal(1000 * 60 * 60 * 24 * 7);
    });
    describe(".downloadTile", () => {
        it("should download a tile", (done: MochaDone) => {
            const tileCache = new IndexedDbTileCache();
            tileCache.downloadTile({x: 0, y: 0, z: 0}).then((value: IIndexedDbTileCacheEntry) => {
                expect(value).to.has.property("contentType");
                expect(value).to.has.property("data");
                expect(value).to.has.property("url");
                expect(value).to.has.property("timestamp");

                expect(value.contentType).to.equal("image/png");
                expect(value.data).to.be.instanceOf(Uint8Array);
                expect(value.url).to.equal("http://{s}.tile.openstreetmap.org/0/0/0.png");
                expect(value.timestamp).to.be.a("number");
                done();
            }, done);
        });
        it("should have stored the before downloaded tile", (done: MochaDone) => {
            const dbRequest: IDBOpenDBRequest = indexedDB.open("tile-cache-data", 1);

            dbRequest.addEventListener("success", (dbEvent: any) => {
                const database: IDBDatabase = dbEvent.target.result;
                const tx = database.transaction(["OSM"])
                    .objectStore("OSM").get("http://{s}.tile.openstreetmap.org/0/0/0.png");

                tx.addEventListener("success", (event: any) => {
                    expect(event.target.result).to.has.property("data");
                    expect(event.target.result.data).to.be.instanceOf(Uint8Array);
                    done();
                });
            });
        });
    });
    describe(".getTileEntry", () => {
        it("should get the before downloaded tile", (done: MochaDone) => {
            const tileCache = new IndexedDbTileCache();
            tileCache.getTileEntry({x: 0 , y: 0, z: 0}).then((tile: IIndexedDbTileCacheEntry) => {
                expect(tile.url).to.equal("http://{s}.tile.openstreetmap.org/0/0/0.png");
                done();
            }, done);
        });
        it("should not get a new tile without the download flag", (done: MochaDone) => {
            const tileCache = new IndexedDbTileCache();
            tileCache.getTileEntry({x: 0 , y: 0, z: 1})
                .then(/* istanbul ignore next */(/* tile: IIndexedDbTileCacheEntry */) => {
                    done(new Error("Received a tile"));
                }, (err) => {
                    expect(err.message).to.equal("Unable to find entry");
                    done();
                });
        });
        it("should get a new tile with the download flag", (done: MochaDone) => {
            const tileCache = new IndexedDbTileCache();
            tileCache.getTileEntry({x: 0 , y: 0, z: 2}, true).then((tile: IIndexedDbTileCacheEntry) => {
                expect(tile.url).to.equal("http://{s}.tile.openstreetmap.org/2/0/0.png");
                done();
            }, done);
        });
        it("should re-download an outdated tile", (done: MochaDone) => {
            const dbRequest: IDBOpenDBRequest = indexedDB.open("tile-cache-data", 1);

            dbRequest.addEventListener("success", (dbEvent: any) => {
                const database: IDBDatabase = dbEvent.target.result;
                const tx = database.transaction(["OSM"], "readwrite")
                    .objectStore("OSM").put({
                        contentType: "wrong/one",
                        data: new Uint8Array(0),
                        timestamp: 123,
                        url: "http://{s}.tile.openstreetmap.org/0/0/0.png",
                    } as IIndexedDbTileCacheEntry);

                tx.addEventListener("success", () => {
                    const tileCache = new IndexedDbTileCache();
                    tileCache.getTileEntry({x: 0 , y: 0, z: 0}, true).then((tile: IIndexedDbTileCacheEntry) => {
                        expect(tile.contentType).to.not.equal("wrong/one");
                        expect(tile.contentType).to.equal("image/png");
                        expect(tile.timestamp).to.be.not.equal(123);
                        done();
                    }, done);
                });
            });
        });
    });
    describe(".createInternalTileUrl", () => {
        it("should get an url that still have the sub domain as placeholder", () => {
            const tileCache = new IndexedDbTileCache();
            expect(tileCache.createInternalTileUrl({x: 1 , y: 2, z: 3}))
                .to.equal("http://{s}.tile.openstreetmap.org/3/1/2.png");
        });
    });
    describe(".createTileUrl", () => {
        it("should get an url without any placeholder", () => {
            const tileCache = new IndexedDbTileCache();
            expect(tileCache.createTileUrl({x: 1 , y: 2, z: 3}))
                .to.be.oneOf([
                "http://a.tile.openstreetmap.org/3/1/2.png",
                "http://b.tile.openstreetmap.org/3/1/2.png",
                "http://c.tile.openstreetmap.org/3/1/2.png",
            ]);
        });
    });
    describe(".getTileAsBuffer", () => {
        it("should get the already fetched tile as Buffer and Uint8Array", (done: MochaDone) => {
            const tileCache = new IndexedDbTileCache();
            tileCache.getTileAsBuffer({x: 0, y: 0, z: 0}).then((buffer) => {
                expect(buffer).to.be.instanceOf(Buffer);
                expect(buffer).to.be.instanceOf(Uint8Array);
                done();
            }, done);
        });
        it("should get a tile that was not fetched before as Buffer and Uint8Array", (done: MochaDone) => {
            const tileCache = new IndexedDbTileCache();
            tileCache.getTileAsBuffer({x: 10, y: 10, z: 10}).then((buffer) => {
                expect(buffer).to.be.instanceOf(Buffer);
                expect(buffer).to.be.instanceOf(Uint8Array);
                done();
            }, done);
        });
    });
    describe(".getTileAsDataUrl", () => {
        it("should get the already fetched tile as data-url", (done: MochaDone) => {
            const tileCache = new IndexedDbTileCache();
            tileCache.getTileAsDataUrl({x: 0, y: 0, z: 0}).then((url: string) => {
                expect(url).to.be.a("string");
                expect(url.substr(0, 22)).to.equal("data:image/png;base64,");
                expect(url.length).to.be.greaterThan(100);
                done();
            }, done);
        });
        it("should get a tile that was not fetched before as Buffer and Uint8Array", (done: MochaDone) => {
            const tileCache = new IndexedDbTileCache();
            tileCache.getTileAsDataUrl({x: 20, y: 20, z: 10}).then((url: string) => {
                expect(url).to.be.a("string");
                expect(url.substr(0, 22)).to.equal("data:image/png;base64,");
                expect(url.length).to.be.greaterThan(100);
                done();
            }, done);
        });
    });
    describe(".seedBBox", () => {
        it("should seed a bounding-box", (done: MochaDone) => {
            const tileCache = new IndexedDbTileCache();
            tileCache.seedBBox({maxLat: 0, maxLng: 0, minLat: 0, minLng: 0}, 0).then(() => {
                done();
            }, done);
        });
        it("should emit 'seed-progress' while seeding", (done: MochaDone) => {
            const tileCache = new IndexedDbTileCache();
            let expectedEmits: number = 2;
            tileCache.on("seed-progress", (progress: IIndexedDbTileCacheSeedProgress) => {
                expect(progress).to.has.property("remains");
                expect(progress).to.has.property("total");
                expect(progress.total).to.equal(1);
                expectedEmits -= 1;
                if (expectedEmits === 0) {
                    return done();
                }
            });
            tileCache.seedBBox({maxLat: 0, maxLng: 0, minLat: 0, minLng: 0}, 0).catch(done);
        });
    });
    describe(".purgeStore", () => {
        it("should purge the whole store", (done: MochaDone) => {
            new IndexedDbTileCache().purgeStore().then(() => {
                const dbRequest: IDBOpenDBRequest = indexedDB.open("tile-cache-data", 1);

                dbRequest.addEventListener("success", (dbEvent: any) => {
                    const database: IDBDatabase = dbEvent.target.result;
                    const tx = database.transaction(["OSM"])
                        .objectStore("OSM").get("http://{s}.tile.openstreetmap.org/0/0/0.png");

                    tx.addEventListener("success", (event: any) => {
                        /* istanbul ignore else */
                        if (event.target.result === undefined) {
                            return done();
                        }
                        /* istanbul ignore next */
                        done(new Error("Found removed store"));
                    });
                    tx.addEventListener("error", /* istanbul ignore next */() => {
                        done();
                    });
                });
            }, done);
        });
    });
});
