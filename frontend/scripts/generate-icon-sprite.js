const fs = require('node:fs');
const path = require('node:path');
const SVGSpriter = require('svg-sprite');

const iconsDirectory = path.resolve(__dirname, '../public/icons');
const iconFiles = fs
  .readdirSync(iconsDirectory)
  .filter((file) => file.endsWith('.svg') && file !== 'sprite.svg')
  .sort();

if (iconFiles.length === 0) {
  throw new Error(`No source SVG icons found in ${iconsDirectory}`);
}

const spriter = new SVGSpriter({
  dest: iconsDirectory,
  shape: {
    id: {
      generator: (fileName) => path.basename(fileName, '.svg'),
    },
  },
  mode: {
    symbol: {
      dest: '.',
      sprite: 'sprite.svg',
    },
  },
});

for (const file of iconFiles) {
  const filePath = path.join(iconsDirectory, file);
  spriter.add(filePath, null, fs.readFileSync(filePath, 'utf8'));
}

spriter.compile((error, result) => {
  if (error) {
    console.error('Failed to generate SVG icon sprite:', error);
    process.exitCode = 1;
    return;
  }

  const sprite = result.symbol.sprite;
  fs.mkdirSync(path.dirname(sprite.path), { recursive: true });
  fs.writeFileSync(sprite.path, sprite.contents);
  console.log(
    `Generated ${path.relative(process.cwd(), sprite.path)} from ${iconFiles.length} icons.`,
  );
});
