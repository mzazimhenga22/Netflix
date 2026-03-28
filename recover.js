const fs = require('fs');
const path = require('path');

const lostFoundDir = path.join(__dirname, '.git', 'lost-found', 'other');
const recoverDir = path.join(__dirname, 'recovered_code');

if (!fs.existsSync(recoverDir)) {
    fs.mkdirSync(recoverDir);
}

const files = fs.readdirSync(lostFoundDir);

files.forEach(file => {
    const filePath = path.join(lostFoundDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Try to guess filename from "export default function X" or "const X = () =>"
    let filename = file + '.txt'; // Default to hash
    
    const exportMatch = content.match(/export default function ([A-Za-z0-9_]+)/);
    const varMatch = content.match(/const ([A-Za-z0-9_]+) = \(/);
    
    if (exportMatch) {
        filename = exportMatch[1] + '_' + file.substring(0, 6) + '.tsx';
    } else if (varMatch) {
        filename = varMatch[1] + '_' + file.substring(0, 6) + '.tsx';
    } else if (content.includes('import React')) {
        filename = 'component_' + file.substring(0, 6) + '.tsx';
    } else if (content.includes('package com.')) {
        const classMatch = content.match(/class ([A-Za-z0-9_]+)/);
        if (classMatch) filename = classMatch[1] + '_' + file.substring(0, 6) + '.kt';
    }
    
    fs.writeFileSync(path.join(recoverDir, filename), content);
});

console.log(`Recovered ${files.length} files to ./recovered_code`);
