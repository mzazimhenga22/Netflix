const fs = require('fs');
const path = require('path');

const recoverDir = path.join(__dirname, 'recovered_code');
const appDir = path.join(__dirname, 'app');
const componentsDir = path.join(__dirname, 'components');

const fileMapping = {
    'ProfilesScreen': 'profiles.tsx',
    'EditProfileScreen': 'edit-profile.tsx',
    'MoviesScreen': '(tabs)/movies.tsx',
    'ClipsScreen': '(tabs)/clips.tsx',
    'HomeScreen': '(tabs)/home.tsx',
    'GamesScreen': '(tabs)/games.tsx',
    'MyNetflixScreen': '(tabs)/my-netflix.tsx',
    'NewAndHotScreen': '(tabs)/new.tsx',
    'LoginScreen': 'login.tsx',
    'SignupScreen': 'signup.tsx',
    'SubscriptionScreen': 'subscription.tsx',
    'AccountScreen': 'account.tsx',
    'DevicesScreen': 'devices.tsx',
    'DownloadsScreen': 'downloads.tsx',
    'MovieDetailScreen': 'movie/[id].tsx',
    'MovieDetailsScreen': 'movie/[id].tsx', // some versions use Details instead
    'NotificationsScreen': 'notifications.tsx',
    'SearchScreen': 'search.tsx',
    'RootLayout': '_layout.tsx',
    'TabLayout': '(tabs)/_layout.tsx',
    'SplashScreen': 'index.tsx' // typically splash or redirect is index
};

const files = fs.readdirSync(recoverDir);
let restoredCount = 0;

files.forEach(file => {
    if (!file.endsWith('.tsx')) return;
    
    // Extract base component name (e.g., ProfilesScreen from ProfilesScreen_f6d7f6.tsx)
    const baseNameMatch = file.match(/^([A-Za-z]+)_/);
    if (!baseNameMatch) return;
    
    const componentName = baseNameMatch[1];
    
    // Check if we have a mapping for it
    if (fileMapping[componentName]) {
        const filePath = path.join(recoverDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Skip TV files for the main app directory to avoid overwriting phone files with TV ones
        const isTvFile = content.includes('TVFocusGuideView') || file.includes('TvPoster') || file.includes('TvTop');
        
        if (!isTvFile) {
            const destPath = path.join(appDir, fileMapping[componentName]);
            
            // Ensure directories exist
            const destDir = path.dirname(destPath);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }
            
            fs.copyFileSync(filePath, destPath);
            console.log(`✅ Restored Phone: ${file} -> app/${fileMapping[componentName]}`);
            restoredCount++;
        } else {
            // Restore to Netflixtv directory
            const tvAppDir = path.join(__dirname, 'Netflixtv', 'app');
            const destPath = path.join(tvAppDir, fileMapping[componentName]);
            
            const destDir = path.dirname(destPath);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }
            
            fs.copyFileSync(filePath, destPath);
            console.log(`📺 Restored TV: ${file} -> Netflixtv/app/${fileMapping[componentName]}`);
            restoredCount++;
        }
    }
});

console.log(`\n🎉 Successfully organized and restored ${restoredCount} screen files!`);
