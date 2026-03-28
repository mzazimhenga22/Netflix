const fs = require('fs');
const path = require('path');

const projectRoot = 'd:\\Netflix2026\\Netflix';
const ignoredDirs = ['node_modules', '.git', '.expo', 'android', 'ios', 'Netflixtv', 'puter', 'assets'];

function getFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            if (!ignoredDirs.includes(path.basename(file))) {
                results = results.concat(getFiles(file));
            }
        } else {
            if (['.ts', '.tsx', '.js', '.jsx'].includes(path.extname(file))) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = getFiles(projectRoot);
const imports = new Set();

files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    // Simple regex for imports: import ... from 'package' or import 'package' or require('package')
    const importMatches = content.matchAll(/import\s+.*?\s+from\s+['"](.*?)['"]/g);
    for (const match of importMatches) {
        imports.add(match[1]);
    }
    const requireMatches = content.matchAll(/require\(['"](.*?)['"]\)/g);
    for (const match of requireMatches) {
        imports.add(match[1]);
    }
    const simpleImportMatches = content.matchAll(/import\s+['"](.*?)['"]/g);
    for (const match of simpleImportMatches) {
        imports.add(match[1]);
    }
});

const externalDeps = Array.from(imports).filter(imp => {
    // Filter out relative imports and project aliases
    return !imp.startsWith('.') && !imp.startsWith('/') && !imp.startsWith('@/') && !imp.startsWith('..');
}).map(imp => {
    // Handle scoped packages like @react-navigation/native
    const parts = imp.split('/');
    if (imp.startsWith('@')) {
        return parts.slice(0, 2).join('/');
    }
    return parts[0];
});

const uniqueDeps = Array.from(new Set(externalDeps)).sort();
console.log(JSON.stringify(uniqueDeps, null, 2));
