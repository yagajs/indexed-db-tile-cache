# YAGA IndexedDB Tile Cache

[![Build Status](https://travis-ci.org/yagajs/indexed-db-tile-cache.svg?branch=develop)](https://travis-ci.org/yagajs/indexed-db-tile-cache)
[![Coverage Status](https://coveralls.io/repos/github/yagajs/indexed-db-tile-cache/badge.svg?branch=develop)](https://coveralls.io/github/yagajs/indexed-db-tile-cache?branch=develop)

A tile storage and cache that uses the browsers IndexedDB to store the spatial map tiles.

## Key features

* On the fly downloading, storing and serving
* Maximal age and auto upgrading of tiles as long as there is a connection
* Seeding in your browser with a bounding box and a zoom level range
* Possibility to serve tiles as base64 data-url including its content type
* Well tested and documented
* Written in and for TypeScript


## How to use

At first you have to install this library with `npm` or `yarn`:

```bash
npm install --save @yaga/indexed-db-tile-cache
# OR
yarn install --save @yaga/indexed-db-tile-cache
```

After that you can import this module into your application with the typical node.js or TypeScript way.

*keep in mind that you have to use browserify to package the libraries from the node.js environment into your browser
ones, such as `Buffer` or `request`.*

### Working with a tile-cache

#### JavaScript
```javascript
const indexedDbTileCache = require('@yaga/indexed-db-tile-cache');
// if you use the precompiled version you can use it similar, just with this change:
// const indexedDbTileCache = window.yaga.tileCache;

const options = {
        databaseName: "tile-cache-data", // optional
        databaseVersion: 1, // optional
        objectStoreName: "OSM", // optional
        tileUrl: "http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", // optional
        tileUrlSubDomains: ["a", "b", "c"], // optional
        crawlDelay: 500, // optional
        maxAge: 1000 * 60 * 60 * 24 * 7, // optional
};

const tileCache = new indexedDbTileCache.IndexedDbTileCache(options);

// get a tile from cache or download if not available:
tileCache.getTileAsDataUrl({x:0, y: 0, z: 0}).then(function(dataUrl) {
    const img = document.createElement("img");
    img.src = dataUrl;
    document.body.appendChild(img);
}, function(err) {
    console.error(err);
});

// seed an area:
tileCache.on("seed-progress", function (progress) {
    console.log(progess.remains + ' of ' + progress.total + 'tiles remains...');
});
tileCache.seedBBox({
    maxLat: 10,
    maxLng: 10,
    minLat: 1,
    minLng: 1,
}).then(function(duration) {
    console.log('Seeding completed in ' + duration + 'ms');
}, function(err) {
    console.error(err);
});

```

#### TypeScript
```typescript
import {
    IIndexedDbTileCacheOptions,
    IIndexedDbTileCacheSeedProgress,
    IndexedDbTileCache,
} from "@yaga/indexed-db-tile-cache";

const options: IIndexedDbTileCacheOptions = {
        databaseName: "tile-cache-data", // optional
        databaseVersion: 1, // optional
        objectStoreName: "OSM", // optional
        tileUrl: "http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", // optional
        tileUrlSubDomains: ["a", "b", "c"], // optional
        crawlDelay: 500, // optional
        maxAge: 1000 * 60 * 60 * 24 * 7, // optional
};

const tileCache = new IndexedDbTileCache(options);

// get a tile from cache or download if not available:
tileCache.getTileAsDataUrl({x:0, y: 0, z: 0}).then((dataUrl: string) => {
    const img = document.createElement("img");
    img.src = dataUrl;
    document.body.appendChild(img);
}, (err) => {
    console.error(err);
});

// seed an area:
tileCache.on("seed-progress", (progress: IIndexedDbTileCacheSeedProgress) => {
    console.log(`${ progess.remains } of ${ progress.total } tiles remains...`);
});
tileCache.seedBBox({
    maxLat: 10,
    maxLng: 10,
    minLat: 1,
    minLng: 1,
}).then((duration: number) => {
    console.log(`Seeding completed in ${ duration }ms`);
}, (err) => {
    console.error(err);
});

```

*There are more methods available, for further information take a look at the API documentation...*

### Precompiled version

If you just want to use this library without having the pros of a module loader, you can also run the npm `dist` task
for a packaged and precompiled version.

At first run:

```bash
npm run dist
```

After that you have a `dist.js` and a `dist.min.js` in this project root folder. Now you can use this library like this:

```html
<html>
  <head>
    <script src="dist.min.js"></script>
    <script>
      const tileCache = new yaga.tileCache.IndexedDbTileCache();
    </script>
  </head>
</html>
```

## NPM script tasks

* `npm test`: Runs the software tests with karma and leaves a coverage report under the folder `coverage`.
* `npm run browser-test`: Prepares the tests to run directly in your browser. After running this command you have to open
`browser-test/index.html` in your browser of choice.
* `npm run dist`: Creates an isolated package (without module loader) and registers the module under
`window.yaga.tileCache.*`.
* `npm run doc`: Creates the API documentation with `typedoc` and places the documentation in the folder `typedoc`.

## Contribution

Make an issue on [GitHub](https://github.com/yagajs/indexed-db-tile-cache/), or even better a pull request and try to
fulfill the software tests.

## License

This library is under [ISC License](https://spdx.org/licenses/ISC.html) © by Arne Schubert and the YAGA Development
Team.