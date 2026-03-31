const fs = require('fs');
const THREE = require('three');
const geo = JSON.parse(fs.readFileSync('public/countries.geojson'));
const cn = geo.features.find(f => f.properties.ISO_A2 === 'CN').geometry;

const polys = cn.type === 'Polygon' ? [cn.coordinates] : cn.coordinates;

function project2D(lon, lat, cLon, cLat) {
    const cosC = Math.cos(cLat * Math.PI / 180);
    return [(lon - cLon) * cosC, lat - cLat];
}

const cLat = 35; // approx china lat
const cLon = 105;

let totalCount = 0;
for (const poly of polys) {
    if (!poly[0] || poly[0].length < 3) continue;
    const pts2D = poly[0].map(([lon, lat]) => {
        const [x, y] = project2D(lon, lat, cLon, cLat);
        return new THREE.Vector2(x, y);
    });
    const shape = new THREE.Shape(pts2D);
    for (let h = 1; h < poly.length; h++) {
        const hole = poly[h].map(([lon, lat]) => {
            const [x, y] = project2D(lon, lat, cLon, cLat);
            return new THREE.Vector2(x, y);
        });
        shape.holes.push(new THREE.Path(hole));
    }
    try {
        const shapeGeo = new THREE.ShapeGeometry(shape, 16);
        totalCount += shapeGeo.attributes.position.count;
    } catch(e) {
        console.error('Triangulation error:', e.message);
    }
}
console.log('Total vertices:', totalCount);
