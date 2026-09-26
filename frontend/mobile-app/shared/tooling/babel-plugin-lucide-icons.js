/**
 * Rewrites `import { Truck, X as Close } from 'lucide-react-native'` into one
 * import per icon file (`lucide-react-native/dist/esm/icons/truck.mjs`).
 *
 * Metro does not tree-shake, so importing from the package root bundles all
 * ~1,700 icons (~1.2 MB of JS). Per-file imports bundle only the icons used.
 * The deep paths are blocked by the package's `exports` map, so Metro
 * resolves them directly (see LUCIDE_DEEP_PREFIX in ./metro.js).
 *
 * Export names are read from the package's own ESM barrel, so aliases
 * (`TruckIcon`, `LucideTruck`) and non-icon exports (`Icon`, `LucideProvider`,
 * `createLucideIcon`, `useLucideContext`) all map to the right file.
 * Type-only specifiers (`type LucideIcon`) are dropped — they are erased anyway.
 */
const fs = require('fs');
const path = require('path');

const PKG = 'lucide-react-native';
const DEEP_PREFIX = `${PKG}/dist/esm/`;

function lucideRoot() {
  // Package `exports` hides package.json; walk up from the resolved CJS entry.
  let dir = path.dirname(require.resolve(PKG));
  while (path.basename(dir) !== PKG) dir = path.dirname(dir);
  return dir;
}

// exportName -> { file: 'icons/truck.mjs', imported: 'default' | named }
function readExportMap() {
  const barrel = fs.readFileSync(path.join(lucideRoot(), 'dist/esm/lucide-react-native.mjs'), 'utf8');
  const map = new Map();
  const re = /export \{([^}]+)\} from '\.\/([^']+)';/g;
  let m;
  while ((m = re.exec(barrel))) {
    for (const part of m[1].split(',')) {
      const [imported, exported] = part.trim().split(/\s+as\s+/);
      map.set(exported || imported, { file: m[2], imported });
    }
  }
  return map;
}

let exportMap;

module.exports = function lucideIcons({ types: t }) {
  exportMap = exportMap || readExportMap();
  return {
    name: 'lucide-per-icon-imports',
    visitor: {
      ImportDeclaration(p) {
        const node = p.node;
        if (node.source.value !== PKG || node.importKind === 'type') return;

        const replacements = [];
        for (const spec of node.specifiers) {
          if (spec.importKind === 'type') continue;
          if (!t.isImportSpecifier(spec)) return; // namespace/default import: leave untouched
          const name = t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value;
          const target = exportMap.get(name);
          if (!target) {
            throw p.buildCodeFrameError(`lucide-react-native has no export named "${name}"`);
          }
          const source = t.stringLiteral(DEEP_PREFIX + target.file);
          const specifier =
            target.imported === 'default'
              ? t.importDefaultSpecifier(t.identifier(spec.local.name))
              : t.importSpecifier(t.identifier(spec.local.name), t.identifier(target.imported));
          replacements.push(t.importDeclaration([specifier], source));
        }

        if (replacements.length === 0) p.remove();
        else p.replaceWithMultiple(replacements);
      },
    },
  };
};

module.exports.DEEP_PREFIX = DEEP_PREFIX;
module.exports.lucideRoot = lucideRoot;
