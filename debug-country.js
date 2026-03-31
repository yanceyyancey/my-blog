const fs = require('fs');
const geo = JSON.parse(fs.readFileSync('public/countries.geojson'));
const cn = geo.features.find(f => f.properties.ISO_A2 === 'CN').geometry;
console.log('CN type:', cn.type);
console.log('Coord length:', cn.coordinates.length);
if (cn.type === 'MultiPolygon') {
   console.log('Poly 0 length:', cn.coordinates[0].length);
   console.log('Poly 0 ring 0 points:', cn.coordinates[0][0].length);
}
