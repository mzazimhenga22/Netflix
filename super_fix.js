const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = __dirname;
const recoverDir = path.join(rootDir, 'recovered_code');
const componentsDir = path.join(rootDir, 'components');
const servicesDir = path.join(rootDir, 'services');
const utilsDir = path.join(rootDir, 'utils');
const pkgPath = path.join(rootDir, 'package.json');

console.log('🚀 Starting Super Fix Script...\n');

// 1. Restore all remaining components and utilities safely
if (!fs.existsSync(componentsDir)) fs.mkdirSync(componentsDir, { recursive: true });
if (!fs.existsSync(servicesDir)) fs.mkdirSync(servicesDir, { recursive: true });
if (!fs.existsSync(utilsDir)) fs.mkdirSync(utilsDir, { recursive: true });

const files = fs.readdirSync(recoverDir);
let restoredCount = 0;

files.forEach(file => {
    if (!file.endsWith('.tsx') && !file.endsWith('.ts') && !file.endsWith('.js') && !file.endsWith('.kt')) return;

    const content = fs.readFileSync(path.join(recoverDir, file), 'utf8');

    // Skip files already restored to app/ or Netflixtv/app/
    if (file.includes('Screen') || file.includes('Layout')) return;

    // Guess the exact name from the file content
    let realName = '';
    const exportDefaultMatch = content.match(/export default (function|class)?\s*([A-Za-z0-9_]+)/);
    const exportConstMatch = content.match(/export const ([A-Za-z0-9_]+)/);
    const functionMatch = content.match(/function ([A-Za-z0-9_]+)/);
    const constMatch = content.match(/const ([A-Za-z0-9_]+) = (\([^)]*\)\s*=>)/);

    if (exportDefaultMatch && exportDefaultMatch[2]) realName = exportDefaultMatch[2];
    else if (exportConstMatch && exportConstMatch[1]) realName = exportConstMatch[1];
    else if (functionMatch && functionMatch[1]) realName = functionMatch[1];
    else if (constMatch && constMatch[1]) realName = constMatch[1];

    if (!realName) {
        // Fallback to removing the hash from the filename
        realName = file.replace(/_[a-f0-9]+/, '');
    } else {
        realName += file.endsWith('.tsx') ? '.tsx' : '.ts';
    }

    // Determine target directory
    let targetDir = componentsDir;
    if (content.includes('import { doc,') || content.includes('firebase') || file.includes('Service') || content.includes('fetch')) {
        targetDir = servicesDir;
        if (!realName.includes('Service') && !realName.includes('tmdb') && !realName.includes('firebase')) {
            // Keep original heuristic if it's a generic UI component that fetches data
            if (content.includes('View') || content.includes('Text')) targetDir = componentsDir;
        }
    }
    if (file.includes('extract') || file.includes('parser') || file.includes('util')) targetDir = utilsDir;
    if (file.toLowerCase().includes('tv') && content.includes('import')) targetDir = path.join(rootDir, 'Netflixtv', 'components');

    // Special exact mappings based on file name prefix
    if (file.startsWith('NetflixHero')) realName = 'NetflixHero.tsx';
    if (file.startsWith('TvCategoryPills')) realName = 'TvCategoryPills.tsx';
    if (file.startsWith('ColorExtractor')) realName = 'ColorExtractor.tsx';
    if (file.startsWith('ExpandingRow')) realName = 'ExpandingRow.tsx';
    if (file.startsWith('TvPosterCard')) realName = 'TvPosterCard.tsx';
    if (file.startsWith('TvTopNav')) realName = 'TvTopNav.tsx';
    if (file.startsWith('HorizontalCarousel')) realName = 'HorizontalCarousel.tsx';
    if (file.startsWith('NetflixRating')) realName = 'NetflixRatingButton.tsx';
    
    // Fallback overrides
    if (file.startsWith('component_')) {
        if (content.includes('TvCategoryPills')) realName = 'TvCategoryPills.tsx';
        if (content.includes('ExpandingRow')) realName = 'ExpandingRow.tsx';
        if (content.includes('ColorExtractor')) realName = 'ColorExtractor.tsx';
        if (content.includes('HomeHero')) realName = 'HomeHero.tsx';
    }

    // Safety checks
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const destPath = path.join(targetDir, realName);
    fs.copyFileSync(path.join(recoverDir, file), destPath);
    console.log(`📦 Restored Component: ${file} -> ${targetDir.split(path.sep).pop()}/${realName}`);
    restoredCount++;
});

// 2. Scan whole project for missing NPM dependencies
console.log('\n🔍 Scanning for missing NPM dependencies...');

const externalDeps = new Set();
const scanDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir);
    items.forEach(item => {
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory() && item !== 'node_modules' && item !== '.git') {
            scanDir(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const importRegex = /import\s+.*?from\s+['"]([^'.][^'"]+)['"]/g;
            let match;
            while ((match = importRegex.exec(content)) !== null) {
                let pkgName = match[1];
                // Handle scoped packages like @expo/vector-icons
                if (pkgName.startsWith('@')) {
                    pkgName = pkgName.split('/').slice(0, 2).join('/');
                } else {
                    pkgName = pkgName.split('/')[0];
                }
                
                // Ignore node built-ins
                const builtIns = ['fs', 'path', 'crypto', 'buffer', 'http', 'https', 'stream', 'zlib', 'events', 'url', 'os', 'child_process'];
                if (!builtIns.includes(pkgName) && pkgName !== 'react' && pkgName !== 'react-native') {
                    externalDeps.add(pkgName);
                }
            }
        }
    });
};

scanDir(path.join(rootDir, 'app'));
scanDir(componentsDir);
scanDir(servicesDir);
scanDir(utilsDir);

// Read package.json to find what's missing
const pkgJSON = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const installedDeps = { ...pkgJSON.dependencies, ...pkgJSON.devDependencies };
const missingDeps = [...externalDeps].filter(dep => !installedDeps[dep]);

if (missingDeps.length > 0) {
    console.log(`\n⚠️ Found ${missingDeps.length} missing dependencies: ${missingDeps.join(', ')}`);
    console.log('⚡ Installing missing packages automatically via Expo CLI...');
    try {
        execSync(`npx expo install ${missingDeps.join(' ')}`, { stdio: 'inherit', cwd: rootDir });
        console.log('✅ Dependencies installed successfully.');
    } catch (e) {
        console.error('❌ Failed to install some dependencies. They may need to be installed manually.');
    }
} else {
    console.log('\n✅ All necessary npm dependencies are already in package.json!');
}

console.log(`\n🎉 Super Fix complete! Restored ${restoredCount} components and ensured your packages are up-to-date.`);
